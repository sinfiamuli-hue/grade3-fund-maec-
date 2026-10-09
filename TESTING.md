# Testing checklist
Automated (`npm test`, 30+ assertions): auth required, setup lock, wrong/right login, calculations from records, partial/full/unpaid/overpaid, duplicate-submission prevention, void + audit trail, parent privacy (own child only, no admin actions, no users/audit), CSV scope, CSRF origin check, logout, year carry-forward, demo removal.

Manual (after deploy):
- [ ] Sign in/out as admin and as a parent; wrong password rejected; parent cannot open Admin
- [ ] Parent sees only their child's payments; changing `student_id` in the URL returns only their child
- [ ] Record full, partial and over-payments; status badges and Outstanding update
- [ ] Double-tap "Save payment": only one record
- [ ] Void a payment/expense with reason; it stays visible as VOID; totals drop it; Audit log shows it
- [ ] Upload a receipt (JPG/PDF); admin can open it; the receipt URL does not open when signed out
- [ ] Year selector; Admin → Close year → next year's opening equals closing
- [ ] CSV exports open correctly; Print → Save as PDF looks right
- [ ] Android Chrome: "Install app" appears and installs; iPhone Safari: Add to Home Screen works; opens standalone
- [ ] Airplane mode: clear offline message, no old figures shown
- [ ] Layouts: small iPhone, Android, tablet, desktop; light and dark mode
- [ ] Remove demo data, then confirm the dashboard shows zeros
