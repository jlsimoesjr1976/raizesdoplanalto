/**
 * Comprime uma imagem no navegador antes do upload: redimensiona para no
 * máximo `maxDim` px no lado maior e exporta como JPEG. Fotos de celular
 * (2–5 MB) viram ~100–200 KB, o que acelera muito o cardápio do cliente.
 * GIFs (animados) e falhas de decodificação retornam o arquivo original.
 */
export async function compressImage(file: File, maxDim = 1000, quality = 0.82): Promise<File> {
  if (file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // Fundo branco para PNGs com transparência convertidos a JPEG
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
