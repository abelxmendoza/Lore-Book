export const CHATGPT_IMPORT_DEMO_OPEN_EVENT = 'lk:open-chatgpt-import-demo';
export const CHATGPT_IMPORT_DEMO_RETURN_EVENT = 'lk:return-from-chatgpt-import-demo';
export const CHATGPT_IMPORT_DEMO_COMPLETED_KEY = 'lk_chatgpt_import_demo_completed';
export const CHATGPT_IMPORT_DEMO_DISMISSED_KEY = 'lk_chatgpt_import_demo_dismissed';

export function openChatGPTImportDemo(options: { returnToOnboarding?: boolean } = {}) {
  window.dispatchEvent(new CustomEvent(CHATGPT_IMPORT_DEMO_OPEN_EVENT, { detail: options }));
}
