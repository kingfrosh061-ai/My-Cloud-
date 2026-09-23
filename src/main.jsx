async function downloadFile(item) {
  if (!supabase) return

  setNotice('Preparing download…')

  try {
    const { data, error } = await supabase.storage
      .from('user-files')
      .download(item.storage_path)

    if (error) throw error

    const blobUrl = URL.createObjectURL(data)
    const link = document.createElement('a')

    link.href = blobUrl
    link.download = item.name || 'download'
    document.body.appendChild(link)
    link.click()
    link.remove()

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)

    setNotice('Download started.')
  } catch (e) {
    setNotice(e.message || 'Download failed.')
  }
}
