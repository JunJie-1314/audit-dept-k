/**
 * 合并 CSS 类名，过滤掉 falsy 值
 * @param classes - 可选的类名字符串
 * @returns 合并后的类名字符串
 */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * 格式化日期为中文格式 (YYYY年MM月DD日)
 * @param dateStr - ISO 日期字符串
 * @returns 格式化后的中文字符串
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
