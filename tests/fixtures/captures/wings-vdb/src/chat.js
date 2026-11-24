// Stand-in for wings-vdb's src/chat.js, the scripted agent. The fixture never
// serves this file: it serves playground/fixtures/wings-vdb/stubs/chat.js.
export function mountChatThread() {
  throw new Error('the real chat.js must not reach the fixture');
}
export function respond() {
  throw new Error('the real chat.js must not reach the fixture');
}
