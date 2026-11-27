// Product page address, shared by the website and the server: /product/4-chicky-chicken-noodles
// The number is what counts; the words are for people and search engines, so renaming a product never breaks old links.
export const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

export const productPath = (p: { id: number; name: string }) => `/product/${p.id}-${slugify(p.name)}`

/** The product id from "/product/4-anything", or null. */
export const productIdFromPath = (path: string) => {
  const m = /^\/product\/(\d{1,9})(?:-[a-z0-9-]*)?$/.exec(path)
  return m ? Number(m[1]) : null
}
