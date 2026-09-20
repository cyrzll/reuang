import React, { useEffect, useRef, useState } from 'react'
import { Building2, Pencil, Plus, QrCode, Trash2, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { apiFetch, SERVER_URL } from '../../lib/api'

interface BankAccount {
  id: number
  bankName: string
  accountNumber: string
  accountHolder: string
}

interface AccountSettings {
  bankAccounts: BankAccount[]
  qrisUrl: string | null
}

type BankDraft = Omit<BankAccount, 'id'>
type Notice = { type: 'success' | 'error'; message: string }

const EMPTY_BANK: BankDraft = {
  bankName: '',
  accountNumber: '',
  accountHolder: '',
}

const QRIS_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_QRIS_SIZE = 5 * 1024 * 1024

export const RekeningSayaSettings: React.FC = () => {
  const [settings, setSettings] = useState<AccountSettings>({ bankAccounts: [], qrisUrl: null })
  const [bankDraft, setBankDraft] = useState<BankDraft>(EMPTY_BANK)
  const [editingBankId, setEditingBankId] = useState<number | null>(null)
  const [bankNotice, setBankNotice] = useState<Notice | null>(null)
  const [qrisFile, setQrisFile] = useState<File | null>(null)
  const [qrisPreview, setQrisPreview] = useState<string | null>(null)
  const [removeQris, setRemoveQris] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const qrisInput = useRef<HTMLInputElement>(null)
  const bankNameInput = useRef<HTMLInputElement>(null)
  const saving = pendingAction !== null

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)

    const loadSettings = async () => {
      const response = await apiFetch<AccountSettings>('/account-settings', { signal: controller.signal })
      if (controller.signal.aborted) return

      if (response.success && response.data && Array.isArray(response.data.bankAccounts)) {
        setSettings(response.data)
      } else {
        setLoadError(response.error || 'Gagal memuat rekening Anda.')
      }
      setLoading(false)
    }

    void loadSettings()
    return () => controller.abort()
  }, [loadAttempt])

  useEffect(() => {
    if (!qrisFile) {
      setQrisPreview(null)
      return
    }

    const previewUrl = URL.createObjectURL(qrisFile)
    setQrisPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [qrisFile])

  const updateField = (field: keyof BankDraft, value: string) => {
    setBankDraft((current) => ({ ...current, [field]: value }))
    setBankNotice(null)
  }

  const resetBankForm = () => {
    setBankDraft(EMPTY_BANK)
    setEditingBankId(null)
  }

  const handleEditBank = (bank: BankAccount) => {
    setEditingBankId(bank.id)
    setBankDraft({ bankName: bank.bankName, accountNumber: bank.accountNumber, accountHolder: bank.accountHolder })
    setBankNotice(null)
    bankNameInput.current?.focus()
  }

  const handleSaveBank = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving || loading || loadError) return

    const bank = {
      bankName: bankDraft.bankName.trim(),
      accountNumber: bankDraft.accountNumber.trim(),
      accountHolder: bankDraft.accountHolder.trim(),
    }
    if (!bank.bankName || !bank.accountNumber || !bank.accountHolder) {
      setBankNotice({ type: 'error', message: 'Lengkapi nama bank, nomor rekening, dan atas nama.' })
      return
    }
    if (!/^\d+$/.test(bank.accountNumber)) {
      setBankNotice({ type: 'error', message: 'Nomor rekening hanya boleh berisi angka.' })
      return
    }

    setPendingAction('bank')
    setBankNotice(null)
    try {
      const endpoint = editingBankId === null
        ? '/account-settings/bank-accounts'
        : `/account-settings/bank-accounts/${editingBankId}`
      const response = await apiFetch<BankAccount>(endpoint, {
        method: editingBankId === null ? 'POST' : 'PUT',
        body: JSON.stringify(bank),
      })
      const savedBank = response.data
      if (!response.success || !savedBank) {
        setBankNotice({ type: 'error', message: response.error || 'Gagal menyimpan rekening. Silakan coba lagi.' })
        return
      }

      setSettings((current) => ({
        ...current,
        bankAccounts: editingBankId === null
          ? [...current.bankAccounts, savedBank]
          : current.bankAccounts.map((account) => account.id === editingBankId ? savedBank : account),
      }))
      resetBankForm()
      setBankNotice({ type: 'success', message: editingBankId === null ? 'Rekening berhasil ditambahkan.' : 'Rekening berhasil diperbarui.' })
    } finally {
      setPendingAction(null)
    }
  }

  const handleDeleteBank = async (bank: BankAccount) => {
    if (saving) return
    setPendingAction(`delete-${bank.id}`)
    setBankNotice(null)
    try {
      const response = await apiFetch(`/account-settings/bank-accounts/${bank.id}`, { method: 'DELETE' })
      if (!response.success) {
        setBankNotice({ type: 'error', message: response.error || 'Gagal menghapus rekening. Silakan coba lagi.' })
        return
      }
      setSettings((current) => ({ ...current, bankAccounts: current.bankAccounts.filter((account) => account.id !== bank.id) }))
      if (editingBankId === bank.id) resetBankForm()
      setBankNotice({ type: 'success', message: 'Rekening berhasil dihapus.' })
    } finally {
      setPendingAction(null)
    }
  }

  const handleSelectQris = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    const file = files?.[0]
    const fileCount = files?.length || 0
    event.target.value = ''
    if (!file) return

    if (fileCount !== 1) {
      setNotice({ type: 'error', message: 'Unggah hanya 1 foto QRIS.' })
      return
    }
    if (!QRIS_IMAGE_TYPES.includes(file.type)) {
      setNotice({ type: 'error', message: 'Gunakan foto QRIS berformat PNG, JPG, atau WebP.' })
      return
    }
    if (file.size === 0 || file.size > MAX_QRIS_SIZE) {
      setNotice({ type: 'error', message: 'Foto QRIS harus berisi gambar dan berukuran maksimal 5 MB.' })
      return
    }

    setQrisFile(file)
    setRemoveQris(false)
    setNotice(null)
  }

  const handleRemoveQris = () => {
    setQrisFile(null)
    setRemoveQris(true)
    setNotice(null)
  }

  const handleSaveQris = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving || loading || loadError) return

    const body = new FormData()
    if (qrisFile) body.set('qris', qrisFile)
    if (removeQris) body.set('removeQris', 'true')

    setPendingAction('qris')
    setNotice(null)
    try {
      const response = await apiFetch<Pick<AccountSettings, 'qrisUrl'>>('/account-settings', { method: 'PUT', body })
      if (!response.success || !response.data) {
        setNotice({ type: 'error', message: response.error || 'Gagal menyimpan QRIS. Silakan coba lagi.' })
        return
      }

      const qrisUrl = response.data.qrisUrl
      setSettings((current) => ({ ...current, qrisUrl }))
      setQrisFile(null)
      setRemoveQris(false)
      setNotice({ type: 'success', message: qrisUrl ? 'QRIS berhasil disimpan.' : 'QRIS berhasil dihapus.' })
    } finally {
      setPendingAction(null)
    }
  }

  const savedQrisUrl = settings.qrisUrl
    ? new URL(settings.qrisUrl, SERVER_URL).href
    : null
  const displayedQris = qrisFile ? qrisPreview : removeQris ? null : savedQrisUrl
  const hasQrisChanges = qrisFile !== null || (removeQris && settings.qrisUrl !== null)

  if (loading) {
    return <p role="status" className="py-6 text-xs text-zinc-500">Memuat rekening...</p>
  }

  if (loadError) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <p role="alert" className="text-xs text-zinc-700">{loadError}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
          Coba Lagi
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b border-zinc-100 pb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-zinc-700" />
            <CardTitle className="text-sm">{editingBankId === null ? 'Tambah Rekening' : 'Ubah Rekening'}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSaveBank} aria-busy={pendingAction === 'bank'}>
            <fieldset disabled={saving} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <legend className="sr-only">Detail rekening bank</legend>
              <div className="space-y-1.5">
                <label htmlFor="bank-name" className="text-xs font-medium text-zinc-700">Nama Bank</label>
                <Input
                  ref={bankNameInput}
                  id="bank-name"
                  name="bankName"
                  value={bankDraft.bankName}
                  onChange={(event) => updateField('bankName', event.target.value)}
                  placeholder="Contoh: BCA"
                  maxLength={100}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="account-number" className="text-xs font-medium text-zinc-700">Nomor Rekening</label>
                <Input
                  id="account-number"
                  name="accountNumber"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  title="Nomor rekening hanya boleh berisi angka."
                  value={bankDraft.accountNumber}
                  onChange={(event) => updateField('accountNumber', event.target.value)}
                  placeholder="Masukkan nomor rekening"
                  maxLength={50}
                  className="font-mono"
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="account-holder" className="text-xs font-medium text-zinc-700">Atas Nama</label>
                <Input
                  id="account-holder"
                  name="accountHolder"
                  value={bankDraft.accountHolder}
                  onChange={(event) => updateField('accountHolder', event.target.value)}
                  placeholder="Nama pemilik rekening"
                  maxLength={100}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                {editingBankId !== null && (
                  <Button type="button" variant="outline" onClick={() => { resetBankForm(); setBankNotice(null) }}>
                    Batal
                  </Button>
                )}
                <Button type="submit">
                  {editingBankId === null && <Plus className="h-3.5 w-3.5" />}
                  {pendingAction === 'bank' ? 'Menyimpan...' : editingBankId === null ? 'Tambah Rekening' : 'Simpan Perubahan'}
                </Button>
              </div>
            </fieldset>
          </form>
        </CardContent>
      </Card>

      {bankNotice && (
        <p
          role={bankNotice.type === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border p-3 text-xs ${bankNotice.type === 'success' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-zinc-100 text-zinc-900'}`}
        >
          {bankNotice.message}
        </p>
      )}

      <Card>
        <CardHeader className="border-b border-zinc-100 pb-4">
          <CardTitle className="text-sm">Daftar Rekening</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {settings.bankAccounts.length === 0 ? (
            <p className="text-xs text-zinc-500">Belum ada rekening yang ditambahkan.</p>
          ) : (
            <ul className="divide-y divide-zinc-100" aria-label="Daftar rekening bank">
              {settings.bankAccounts.map((bank) => (
                <li key={bank.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
                  <dl className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                    <div className="min-w-0">
                      <dt className="text-[11px] text-zinc-500">Nama Bank</dt>
                      <dd className="mt-1 break-words text-xs font-semibold text-zinc-950">{bank.bankName}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] text-zinc-500">Nomor Rekening</dt>
                      <dd className="mt-1 break-all font-mono text-xs text-zinc-950">{bank.accountNumber}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] text-zinc-500">Atas Nama</dt>
                      <dd className="mt-1 break-words text-xs text-zinc-950">{bank.accountHolder}</dd>
                    </div>
                  </dl>
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      aria-label={`Ubah rekening ${bank.bankName} ${bank.accountNumber}`}
                      onClick={() => handleEditBank(bank)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Ubah
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      aria-label={`Hapus rekening ${bank.bankName} ${bank.accountNumber}`}
                      onClick={() => void handleDeleteBank(bank)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {pendingAction === `delete-${bank.id}` ? 'Menghapus...' : 'Hapus'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSaveQris} className="space-y-4" aria-busy={pendingAction === 'qris'}>
        <fieldset disabled={saving} className="min-w-0">
          <legend className="sr-only">QRIS akun</legend>
          <Card>
            <CardHeader className="border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-zinc-700" />
                <CardTitle className="text-sm">Foto QRIS</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex min-h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                {displayedQris ? (
                  <img src={displayedQris} alt="Foto QRIS rekening saya" className="max-h-64 w-full object-contain" />
                ) : (
                  <QrCode aria-hidden="true" className="h-10 w-10 text-zinc-300" />
                )}
              </div>
              <div className="min-w-0 space-y-3">
                <p id="qris-upload-hint" className="text-xs text-zinc-500">Hanya 1 foto QRIS per akun. PNG, JPG, atau WebP, maksimal 5 MB.</p>
                <input
                  ref={qrisInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Unggah foto QRIS"
                  aria-describedby="qris-upload-hint"
                  onChange={handleSelectQris}
                  hidden
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => qrisInput.current?.click()}>
                    <Upload className="h-3.5 w-3.5" />
                    {displayedQris || qrisFile ? 'Ganti Foto' : 'Unggah Foto QRIS'}
                  </Button>
                  {(displayedQris || qrisFile) && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleRemoveQris}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </Button>
                  )}
                </div>
                {qrisFile && <p className="break-all text-xs text-zinc-600">{qrisFile.name}</p>}
              </div>
            </CardContent>
          </Card>
        </fieldset>

        {notice && (
          <p
            role={notice.type === 'error' ? 'alert' : 'status'}
            className={`rounded-lg border p-3 text-xs ${notice.type === 'success' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-zinc-100 text-zinc-900'}`}
          >
            {notice.message}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !hasQrisChanges}>
            {pendingAction === 'qris' ? 'Menyimpan...' : 'Simpan QRIS'}
          </Button>
        </div>
      </form>
    </div>
  )
}
