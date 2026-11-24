// Stand-in for wings-vdb's src/chat.js, the scripted agent. The fixture
// serves this instead, so the page lays its chat out as an empty panel and
// never reaches a reply.
export function mountChatThread() {
  return {
    get empty() { return true; },
    get expanded() { return false; },
    send() {},
    clear() {},
    focus() {},
    fit() { return 0; },
    layoutPills() { return { height: 0, boxes: [] }; },
  };
}

export function respond() {
  return { blocks: [] };
}
