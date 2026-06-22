/**
 * A single turn in the help chat conversation.
 *
 * - role: who sent this message (user or assistant).
 * - content: the text of the message.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Input to HelpChatUseCase. */
export interface HelpChatInput {
  /** Authenticated user's role (determines which guide to load). */
  role: string;
  /** Ordered list of conversation turns. Last message must be from 'user'. */
  messages: ChatMessage[];
}

/** Output of HelpChatUseCase. */
export interface HelpChatOutput {
  reply: string;
}
