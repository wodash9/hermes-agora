export type MessagesViewport = {
  scrollHeight: number;
  scrollTop: number;
  scrollTo?: (options: ScrollToOptions) => void;
};

export function scrollMessagesToLatest(messagesViewport: MessagesViewport | null) {
  if (!messagesViewport) return;

  const targetTop = messagesViewport.scrollHeight;
  messagesViewport.scrollTop = targetTop;
  messagesViewport.scrollTo?.({ top: targetTop, behavior: 'auto' });
}
