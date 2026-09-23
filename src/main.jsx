import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Cloud, Moon, Sun, Image, Video, Folder, Star, Trash2, Share2,
  Settings, LogOut, Upload, Search, ShieldCheck, HardDrive, Plus,
  Menu, X, ArrowLeft, Download, MoreVertical, RefreshCw
} from 'lucide-react'
import { supabase, supabaseConfigured } from './supabase'
import './styles.css'

const MAX_BYTES = 1024 ** 4

function App() {
  const [session, setSession] = useState(null)
  const [theme, setTheme] = useState(localStorage.getItem('my-cloud-theme') || 'light')
  const [page, setPage] = useState('home')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [files, setFiles] = useState([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')
  const [authMode, setAuthMode] = useState('landing')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('my-cloud-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => setSession(next)
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadFiles()
  }, [session, page])

  async function loadFiles() {
    if (!supabase || !session) return

    setLoadingFiles(true)

    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('owner_id', session.user.id)
      .eq('is_trashed', page === 'trash')
      .order('created_at', { ascending: false })

    if (!error) {
      setFiles(data || [])
    }

    setLoadingFiles(false)
  }

  async function signInGoogle() {
    if (!supabaseConfigured) {
      setNotice('Connect your Supabase project first. See SETUP.md.')
      return
    }

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
  }

  async function signOut() {
    await supabase?.auth.signOut()
    setPage('home')
  }

  async function uploadFiles(fileList) {
    if (!supabase || !session || !fileList?.length) return

    setUploading(true)
    setNotice('')

    try {
      for (const file of Array.from(fileList)) {
        const { data: quota } = await supabase.rpc('get_storage_usage')

        const used = Number(quota || 0)

        if (used + file.size > MAX_BYTES) {
          throw new Error(
            'This upload would exceed your 1 TB storage quota.'
          )
        }

        const safeName = file.name.replace(/[^\w.\- ()]/g, '_')
        const path = `${session.user.id}/${crypto.randomUUID()}-${safeName}`

        const { error: storageError } = await supabase.storage
          .from('user-files')
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false
          })

        if (storageError) throw storageError

        const { error: dbError } = await supabase
          .from('files')
          .insert({
            owner_id: session.user.id,
            name: file.name,
            storage_path: path,
            mime_type: file.type || 'application/octet-stream',
            size_bytes: file.size,
            kind: file.type.startsWith('image/')
              ? 'photo'
              : file.type.startsWith('video/')
                ? 'video'
                : 'file'
          })

        if (dbError) {
          await supabase.storage
            .from('user-files')
            .remove([path])

          throw dbError
        }
      }

      setNotice('Upload complete.')
      await loadFiles()
    } catch (e) {
      setNotice(e.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function trashFile(item) {
    if (!supabase) return

    const { error } = await supabase
      .from('files')
      .update({ is_trashed: true })
      .eq('id', item.id)
      .eq('owner_id', session.user.id)

    if (!error) {
      loadFiles()
    }
  }

  async function restoreFile(item) {
    if (!supabase) return

    const { error } = await supabase
      .from('files')
      .update({ is_trashed: false })
      .eq('id', item.id)
      .eq('owner_id', session.user.id)

    if (!error) {
      loadFiles()
    }
  }

  async function deleteForever(item) {
    if (!supabase) return

    await supabase.storage
      .from('user-files')
      .remove([item.storage_path])

    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', item.id)
      .eq('owner_id', session.user.id)

    if (!error) {
      loadFiles()
    }
  }

  // Download the file instead of opening it in a new browser tab.
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
      link.style.display = 'none'

      document.body.appendChild(link)
      link.click()
      link.remove()

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
      }, 1000)

      setNotice('Download started.')
    } catch (e) {
      setNotice(e.message || 'Download failed.')
    }
  }

  if (!session) {
    return (
      <Landing
        theme={theme}
        setTheme={setTheme}
        onGoogle={signInGoogle}
        notice={notice}
        authMode={authMode}
        setAuthMode={setAuthMode}
      />
    )
  }

  const usage = files.reduce(
    (sum, f) => sum + Number(f.size_bytes || 0),
    0
  )

  return (
    <Dashboard
      {...{
        theme,
        setTheme,
        page,
        setPage,
        mobileOpen,
        setMobileOpen,
        files,
        loadingFiles,
        uploading,
        notice,
        setNotice,
        usage,
        uploadFiles,
        trashFile,
        restoreFile,
        deleteForever,
        downloadFile,
        signOut
      }}
    />
  )
}

function Landing({
  theme,
  setTheme,
  onGoogle,
  notice,
  authMode,
  setAuthMode
}) {
  return (
    <div className="landing">
      <header className="topbar">
        <Brand />

        <div className="top-actions">
          <ThemeToggle theme={theme} setTheme={setTheme} />

          <button
            className="ghost-btn"
            onClick={() => setAuthMode('signin')}
          >
            Sign in
          </button>
        </div>
      </header>

      <main className="landing-main">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="dot" /> YOUR PERSONAL CLOUD
            </div>

            <h1>
              Your memories.
              <br />
              <span>Your files.</span>
              <br />
              Your cloud.
            </h1>

            <p className="hero-text">
              My Cloud is your personal online space for keeping your photos,
              videos and important files safe, organized and accessible from
              any device.
            </p>

            <div className="hero-actions">
              <button className="primary-btn" onClick={onGoogle}>
                <span className="google">G</span>
                Continue with Google
              </button>

              <button
                className="secondary-btn"
                onClick={() => setAuthMode('signin')}
              >
                ✉ <span>Continue with Email</span>
              </button>
            </div>

            {notice && <div className="notice">{notice}</div>}

            <p className="legal">
              By continuing, you agree to our{' '}
              <a href="#">Terms of Service</a> and{' '}
              <a href="#">Privacy Policy</a>.
            </p>
          </div>

          <div className="hero-visual">
            <div className="glow" />

            <div className="photo-stack">
              <div className="photo back one" />
              <div className="photo back two" />

              <div className="photo main">
                <div className="photo-label">
                  <small>YOUR MEMORIES</small>
                  <b>Safe in My Cloud</b>
                </div>
              </div>
            </div>

            <div className="storage-float glass">
              <Cloud />

              <div>
                <small>Personal storage</small>
                <strong>1 TB</strong>
                <span>Ready for your memories</span>
              </div>

              <div className="ring">1TB</div>
            </div>
          </div>
        </section>

        <section className="features">
          <Feature
            icon={<Image />}
            title="Photos & Videos"
            text="Keep your memories organized in one secure place."
          />

          <Feature
            icon={<Folder />}
            title="Private Folders"
            text="Create folders and albums to keep personal files organized."
          />

          <Feature
            icon={<Cloud />}
            title="Access Anywhere"
            text="Access your files from another phone or computer when you need them."
          />
        </section>

        <section className="security glass">
          <div className="shield">
            <ShieldCheck />
          </div>

          <div>
            <h3>Secure. Private. Reliable.</h3>
            <p>
              Your files are private to your account by default and protected
              by database access policies.
            </p>
          </div>

          <span>PRIVATE BY DEFAULT</span>
        </section>
      </main>

      <footer>
        © 2026 My Cloud
        <span>Your memories. Your files. Your cloud.</span>
      </footer>

      {authMode !== 'landing' && (
        <EmailModal
          mode={authMode}
          close={() => setAuthMode('landing')}
        />
      )}
    </div>
  )
}

function EmailModal({ mode, close }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit(e) {
    e.preventDefault()

    if (!supabase) {
      setMsg(
        'Supabase is not configured. Add your environment variables first.'
      )
      return
    }

    setBusy(true)
    setMsg('')

    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({
            email,
            password
          })

    if (result.error) {
      setMsg(result.error.message)
    } else {
      setMsg(
        mode === 'signup'
          ? 'Account created. Check your email if confirmation is enabled.'
          : 'Signed in.'
      )
    }

    setBusy(false)
  }

  return (
    <div className="modal">
      <div className="backdrop" onClick={close} />

      <div className="modal-card">
        <button className="close" onClick={close}>
          <X />
        </button>

        <div className="modal-logo">
          <Cloud />
        </div>

        <h2>
          {mode === 'signup' ? 'Create your My Cloud account' : 'Welcome back'}
        </h2>

        <p>
          {mode === 'signup'
            ? 'Start your private cloud.'
            : 'Sign in to access your files.'}
        </p>

        <form onSubmit={submit}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            minLength="6"
            required
          />

          <button className="primary-btn" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        {msg && <div className="notice">{msg}</div>}

        <button
          className="link-btn"
          onClick={() =>
            setMsg(
              'For the production release we will also add password reset and email verification flows.'
            )
          }
        >
          Need help?
        </button>
      </div>
    </div>
  )
}

function Dashboard(p) {
  const title = {
    home: 'Home',
    photos: 'Photos',
    videos: 'Videos',
    folders: 'Folders',
    favorites: 'Favorites',
    shared: 'Shared',
    trash: 'Trash',
    settings: 'Settings'
  }[p.page]

  const filtered = useMemo(
    () =>
      p.files.filter(
        f =>
          p.page === 'home' ||
          p.page === 'trash' ||
          (p.page === 'photos' && f.kind === 'photo') ||
          (p.page === 'videos' && f.kind === 'video') ||
          (p.page === 'favorites' && f.is_favorite)
      ),
    [p.files, p.page]
  )

  const gb = (Number(p.usage) / 1024 ** 3).toFixed(2)
  const percent = Math.min(
    100,
    (Number(p.usage) / MAX_BYTES) * 100
  )

  return (
    <div className="dashboard">
      <aside
        className={`sidebar ${p.mobileOpen ? 'open' : ''}`}
      >
        <div className="side-head">
          <Brand />

          <button
            className="close mobile-only"
            onClick={() => p.setMobileOpen(false)}
          >
            <X />
          </button>
        </div>

        <nav>
          <Nav
            icon={<HardDrive />}
            label="Home"
            active={p.page === 'home'}
            go={() => p.setPage('home')}
          />

          <Nav
            icon={<Image />}
            label="Photos"
            active={p.page === 'photos'}
            go={() => p.setPage('photos')}
          />

          <Nav
            icon={<Video />}
            label="Videos"
            active={p.page === 'videos'}
            go={() => p.setPage('videos')}
          />

          <Nav
            icon={<Folder />}
            label="Folders"
            active={p.page === 'folders'}
            go={() => p.setPage('folders')}
          />

          <Nav
            icon={<Star />}
            label="Favorites"
            active={p.page === 'favorites'}
            go={() => p.setPage('favorites')}
          />

          <Nav
            icon={<Share2 />}
            label="Shared"
            active={p.page === 'shared'}
            go={() => p.setPage('shared')}
          />

          <Nav
            icon={<Trash2 />}
            label="Trash"
            active={p.page === 'trash'}
            go={() => p.setPage('trash')}
          />
        </nav>

        <div className="side-bottom">
          <Nav
            icon={<Settings />}
            label="Settings"
            active={p.page === 'settings'}
            go={() => p.setPage('settings')}
          />

          <button className="nav" onClick={p.signOut}>
            <LogOut />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="dash-content">
        <header className="dashbar">
          <button
            className="mobile-menu"
            onClick={() => p.setMobileOpen(true)}
          >
            <Menu />
          </button>

          <div className="dash-search">
            <Search />
            <input placeholder="Search your cloud…" />
          </div>

          <ThemeToggle
            theme={p.theme}
            setTheme={p.setTheme}
          />

          <div className="avatar">
            {(p.files?.[0]?.owner_id || 'U')
              .slice(0, 1)
              .toUpperCase()}
          </div>
        </header>

        <section className="dash-page">
          <div className="page-title">
            <div>
              <small>MY CLOUD</small>
              <h1>{title}</h1>
            </div>

            <label className="upload-btn">
              <Upload />
              {p.uploading ? 'Uploading…' : 'Upload'}

              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={e => p.uploadFiles(e.target.files)}
                disabled={p.uploading}
              />
            </label>
          </div>

          {p.notice && <div className="notice">{p.notice}</div>}

          <div className="usage-card glass">
            <div className="usage-head">
              <div>
                <span>Storage used</span>
                <b>{gb} GB of 1 TB</b>
              </div>

              <Cloud />
            </div>

            <div className="progress">
              <i style={{ width: `${percent}%` }} />
            </div>

            <small>
              {(1024 - percent * 10.24).toFixed(0)} GB available
            </small>
          </div>

          <div className="quick-grid">
            <Quick
              icon={<Image />}
              name="Photos"
              count={p.files.filter(f => f.kind === 'photo').length}
            />

            <Quick
              icon={<Video />}
              name="Videos"
              count={p.files.filter(f => f.kind === 'video').length}
            />

            <Quick
              icon={<Folder />}
              name="Folders"
              count="—"
            />

            <Quick
              icon={<Star />}
              name="Favorites"
              count={p.files.filter(f => f.is_favorite).length}
            />
          </div>

          <div className="recent-head">
            <h2>
              {p.page === 'trash'
                ? 'Recently deleted'
                : 'Recent files'}
            </h2>

            <span>{filtered.length} items</span>
          </div>

          {p.loadingFiles ? (
            <div className="empty">
              <RefreshCw className="spin" />
              <b>Loading your cloud…</b>
            </div>
          ) : filtered.length ? (
            <div className="file-grid">
              {filtered.map(item => (
                <FileCard
                  key={item.id}
                  item={item}
                  trash={p.page === 'trash'}
                  {...p}
                />
              ))}
            </div>
          ) : (
            <div className="empty">
              <Cloud />

              <b>
                {p.page === 'trash'
                  ? 'Your trash is empty'
                  : 'Your cloud is ready'}
              </b>

              <span>
                Upload photos or videos and they will appear here.
              </span>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function FileCard({
  item,
  trash,
  downloadFile,
  trashFile,
  restoreFile,
  deleteForever
}) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let live = true

    if (
      item.mime_type?.startsWith('image/') &&
      supabase
    ) {
      supabase.storage
        .from('user-files')
        .createSignedUrl(item.storage_path, 300)
        .then(({ data }) => {
          if (live) {
            setUrl(data?.signedUrl || '')
          }
        })
    }

    return () => {
      live = false
    }
  }, [item])

  return (
    <article className="file-card">
      <div className="thumb">
        {url ? (
          <img src={url} alt={item.name} />
        ) : item.kind === 'video' ? (
          <Video />
        ) : (
          <Image />
        )}
      </div>

      <div className="file-meta">
        <b title={item.name}>{item.name}</b>
        <small>
          {(Number(item.size_bytes) / 1024 / 1024).toFixed(1)} MB
        </small>
      </div>

      <div className="file-actions">
        {trash ? (
          <>
            <button
              onClick={() => restoreFile(item)}
              title="Restore"
            >
              ↶
            </button>

            <button
              onClick={() => deleteForever(item)}
              title="Delete permanently"
            >
              <X />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => downloadFile(item)}
              title="Download"
            >
              <Download />
            </button>

            <button
              onClick={() => trashFile(item)}
              title="Move to trash"
            >
              <Trash2 />
            </button>
          </>
        )}
      </div>
    </article>
  )
}

function Feature({ icon, title, text }) {
  return (
    <article className="feature">
      <div>{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

function Quick({ icon, name, count }) {
  return (
    <button className="quick">
      <span>{icon}</span>
      <b>{name}</b>
      <small>{count} items</small>
    </button>
  )
}

function Nav({ icon, label, active, go }) {
  return (
    <button
      className={`nav ${active ? 'active' : ''}`}
      onClick={go}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function Brand() {
  return (
    <a className="brand" href="#">
      <span className="brand-mark">
        <Cloud />
      </span>

      <span>
        My <strong>Cloud</strong>
      </span>
    </a>
  )
}

function ThemeToggle({ theme, setTheme }) {
  return (
    <button
      className="theme-toggle"
      onClick={() =>
        setTheme(theme === 'light' ? 'dark' : 'light')
      }
      aria-label="Toggle theme"
    >
      {theme === 'light' ? <Sun /> : <Moon />}
    </button>
  )
}

createRoot(document.getElementById('root')).render(<App />)
