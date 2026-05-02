export type Filter = 'all' | 'home' | 'school' | 'work' | 'done';
export type Priority = 'high' | 'medium' | 'low';
export type Category = 'home' | 'school' | 'work';

export interface Todo {
  id: number;
  text: string;
  done: boolean;
  priority: Priority;
  dueDate: string;
  category?: Category;
}

export const PRIORITY_VALUES: Priority[] = ['high', 'medium', 'low']
export const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'var(--red)', medium: 'var(--orange)', low: 'var(--blue)',
}

export const CATEGORY_VALUES: Category[] = ['home', 'school', 'work']
export const CATEGORY_COLORS: Record<Category, string> = {
  home: 'var(--green)', school: 'var(--purple)', work: 'var(--blue)',
}
