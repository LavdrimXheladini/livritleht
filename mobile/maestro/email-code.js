// The newest 6-digit sign-in code sent to EMAIL, read from Mailpit — where the local Supabase
// (`supabase start`) delivers its emails: http://127.0.0.1:54324. Run it once the code screen shows:
// the server hands the email to Mailpit before it answers the app. Each run uses a new address, so
// an older code can't be picked up.
const found = json(http.get(`http://127.0.0.1:54324/api/v1/search?query=to:${EMAIL}&limit=1`).body);
if (!found.messages || found.messages.length === 0) throw new Error(`no email to ${EMAIL}`);
const message = json(http.get(`http://127.0.0.1:54324/api/v1/message/${found.messages[0].ID}`).body);
const code = /\b(\d{6})\b/.exec(message.Text);
if (!code) throw new Error('no 6-digit code in the email');
output.code = code[1];
