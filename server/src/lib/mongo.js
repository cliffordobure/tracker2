import mongoose from 'mongoose';

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  retryReads: true,
  retryWrites: true,
  maxPoolSize: 10,
};

let mongoUri = '';
let refreshPromise = null;
let refreshWindowStart = 0;
let refreshAttempts = 0;
let retryInstalled = false;

function errorText(err) {
  return [err?.message, err?.reason?.message, err?.cause?.message, err?.error?.message]
    .filter(Boolean)
    .join(' ');
}

export function isStalePrimaryError(err) {
  const message = errorText(err);
  return (
    err?.name === 'MongoStalePrimaryError' ||
    message.includes('electionId/setVersion mismatch') ||
    message.includes('primary marked stale')
  );
}

export function clientErrorMessage(err) {
  if (isStalePrimaryError(err)) {
    return 'The database is temporarily unavailable. Wait a few seconds and try again.';
  }
  return err?.message || 'Something went wrong. Try again.';
}

function currentClient() {
  try {
    return mongoose.connection.getClient();
  } catch {
    return null;
  }
}

function onServerDescriptionChanged(event) {
  const message = event?.newDescription?.error?.message || '';
  if (message.includes('electionId/setVersion mismatch') || message.includes('primary marked stale')) {
    void refreshMongoTopology('monitor');
  }
}

function watchClient(client) {
  if (!client || client.__stalePrimaryWatch) return;
  client.__stalePrimaryWatch = true;
  client.on('serverDescriptionChanged', onServerDescriptionChanged);
}

function unwatchClient(client) {
  if (!client) return;
  client.off('serverDescriptionChanged', onServerDescriptionChanged);
  client.__stalePrimaryWatch = false;
}

export function refreshMongoTopology(reason) {
  if (refreshPromise) return refreshPromise;
  if (!mongoUri) return Promise.resolve(false);

  const now = Date.now();
  if (now - refreshWindowStart > 60_000) {
    refreshWindowStart = now;
    refreshAttempts = 0;
  }
  if (refreshAttempts >= 3) return Promise.resolve(false);
  refreshAttempts += 1;

  refreshPromise = (async () => {
    console.warn(`MongoDB primary went stale (${reason}); reconnecting to refresh the replica set view`);
    unwatchClient(currentClient());
    try {
      await mongoose.disconnect();
    } catch (err) {
      console.warn('MongoDB disconnect before refresh failed', err?.message || err);
    }
    await mongoose.connect(mongoUri, MONGO_OPTIONS);
    watchClient(currentClient());
    console.log('MongoDB reconnected');
    return true;
  })()
    .catch((err) => {
      console.error('MongoDB reconnect failed', err);
      return false;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export function installMongoRetry() {
  if (retryInstalled) return;
  retryInstalled = true;

  const originalExec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = function execWithStalePrimaryRetry(...args) {
    const alreadyRetried = Boolean(this._staleRetried);
    return originalExec.apply(this, args).catch(async (err) => {
      if (!isStalePrimaryError(err) || alreadyRetried) throw err;
      const refreshed = await refreshMongoTopology('query');
      if (!refreshed) throw err;
      const next = this.clone();
      next._staleRetried = true;
      return next.exec(...args);
    });
  };

  const originalSave = mongoose.Document.prototype.save;
  mongoose.Document.prototype.save = function saveWithStalePrimaryRetry(...args) {
    const alreadyRetried = Boolean(this.$locals?.staleRetried);
    return Promise.resolve(originalSave.apply(this, args)).catch(async (err) => {
      if (!isStalePrimaryError(err) || alreadyRetried) throw err;
      const refreshed = await refreshMongoTopology('save');
      if (!refreshed) throw err;
      this.$locals = this.$locals || {};
      this.$locals.staleRetried = true;
      return originalSave.apply(this, args);
    });
  };
}

export async function connectMongo(uri) {
  mongoUri = uri;
  installMongoRetry();
  await mongoose.connect(mongoUri, MONGO_OPTIONS);
  watchClient(currentClient());
}
