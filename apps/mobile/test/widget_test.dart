import 'package:flutter_test/flutter_test.dart';
import 'package:school_kids_tracker/main.dart';

void main() {
  testWidgets('App boots', (tester) async {
    await tester.pumpWidget(const SchoolKidsApp());
    await tester.pump();
    expect(find.byType(SchoolKidsApp), findsOneWidget);
  });
}
