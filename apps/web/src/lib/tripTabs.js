import { useSyncExternalStore } from 'react';

export const TRIP_TABS = [
  { id: 'daily', label: 'Daily trips' },
  { id: 'schedules', label: 'Scheduling' },
  { id: 'tours', label: 'Tours & outings' },
];

const URL_EVENT = 'sa-url-change';

export function tabFromSearch(search) {
  const value = new URLSearchParams(search).get('tab');
  return TRIP_TABS.some((t) => t.id === value) ? value : 'daily';
}

export function tabHref(id) {
  return id === 'daily' ? '/school-admin/trip-instances' : `/school-admin/trip-instances?tab=${id}`;
}

function notifyUrl() {
  window.dispatchEvent(new Event(URL_EVENT));
}

function hookHistory() {
  if (typeof window === 'undefined' || window.__saUrlHooked) return;
  window.__saUrlHooked = true;
  ['pushState', 'replaceState'].forEach((type) => {
    const orig = history[type];
    history[type] = function hookedHistory(...args) {
      const ret = orig.apply(this, args);
      notifyUrl();
      return ret;
    };
  });
  window.addEventListener('popstate', notifyUrl);
}

function subscribeUrl(cb) {
  hookHistory();
  window.addEventListener(URL_EVENT, cb);
  return () => window.removeEventListener(URL_EVENT, cb);
}

function getSearch() {
  return window.location.search;
}

export function useWindowSearch() {
  return useSyncExternalStore(subscribeUrl, getSearch, () => '');
}

export function useTripTab() {
  return tabFromSearch(useWindowSearch());
}

export function writeTripTab(id) {
  const href = tabHref(id);
  if (`${window.location.pathname}${window.location.search}` === href) {
    notifyUrl();
    return;
  }
  window.history.pushState(window.history.state, '', href);
  notifyUrl();
}
