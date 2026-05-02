import JSZip from 'jszip'

export async function createZipFromPdfs(
  files: Array<{ name: string; data: Uint8Array }>
): Promise<Uint8Array> {
  const zip = new JSZip()
  files.forEach(({ name, data }) => zip.file(name, data))
  return zip.generateAsync({ type: 'uint8array' })
}
