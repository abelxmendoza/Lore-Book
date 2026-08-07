/** Off by default: this guards a new, unreviewed write path, not an established one. */
export function isDualWriteEnabled(): boolean {
  return process.env.KNOWLEDGE_KERNEL_DUAL_WRITE === '1';
}
