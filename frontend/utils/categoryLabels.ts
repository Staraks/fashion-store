export const CATEGORY_LABELS: Record<string, string> = {
  women: 'Женщинам',
  men: 'Мужчинам',
  accessories: 'Аксессуары',
};

export function getCategoryLabel(category?: string | null) {
  if (!category) {
    return 'Каталог';
  }

  return CATEGORY_LABELS[category] || category;
}
