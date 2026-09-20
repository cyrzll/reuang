import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Plus,
  Search,
  Package,
  Trash2,
  Pencil,
  RefreshCw,
  X,
  Upload,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  ChevronDown,
  Tag,
  Check,
} from 'lucide-react'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { apiFetch } from '../../lib/api'
import { cn } from '../../lib/utils'
import type { Product, Category } from '../types'

export const KatalogView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  // Category Modal & CRUD states
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  // Add Product Modal States
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSku, setNewSku] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newModal, setNewModal] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newStock, setNewStock] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Edit Product Modal States
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editName, setEditName] = useState('')
  const [editSku, setEditSku] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editModal, setEditModal] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editStock, setEditStock] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSelectedImageFile, setEditSelectedImageFile] = useState<File | null>(null)
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null)
  const [editExistingImageUrl, setEditExistingImageUrl] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const editFileInputRef = useRef<HTMLInputElement>(null)

  // Delete Confirmation Modal State
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)

  // WA Sync states
  const [syncingWa, setSyncingWa] = useState(false)
  const [syncNotice, setSyncNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Fetch Categories
  const fetchCategories = async () => {
    try {
      const res = await apiFetch<Category[]>('/categories')
      if (res.success && Array.isArray(res.data)) {
        setCategories(res.data)
      } else {
        setCategories([])
      }
    } catch {
      setCategories([])
    }
  }

  // Fetch Products
  const fetchProducts = async () => {
    try {
      const res = await apiFetch<Product[]>('/katalog')
      if (res.success && Array.isArray(res.data)) {
        setProducts(res.data)
      } else {
        setProducts([])
      }
    } catch {
      setProducts([])
    }
  }

  useEffect(() => {
    fetchCategories()
    fetchProducts()
  }, [])

  // Collect all unique categories: user categories first, then any extra category present in products
  const allCategoryNames = useMemo(() => {
    const list: string[] = []
    const seen = new Set<string>()

    // Ensure 'Umum' is always available as first baseline
    seen.add('Umum')
    list.push('Umum')

    // Add user custom categories
    categories.forEach((c) => {
      const name = c.name.trim()
      if (name && !seen.has(name)) {
        seen.add(name)
        list.push(name)
      }
    })

    // Add any category from existing products that might not be in categories table
    products.forEach((p) => {
      const name = (p.category || '').trim()
      if (name && !seen.has(name)) {
        seen.add(name)
        list.push(name)
      }
    })

    return list
  }, [categories, products])

  // Set initial open category to the first one once loaded
  useEffect(() => {
    if (openCategory === null && allCategoryNames.length > 0) {
      setOpenCategory(allCategoryNames[0])
    }
  }, [allCategoryNames, openCategory])

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    )
  }, [products, search])

  // Toggle accordion: only one can be open at a time
  const toggleCategory = (catName: string) => {
    setOpenCategory((prev) => (prev === catName ? null : catName))
  }

  // Helper to generate next unique sequential SKU automatically (e.g. PRD-001, PRD-002, ...)
  const generateAutoSku = (existingList: Product[] = []) => {
    let maxNum = 0
    existingList.forEach((p) => {
      const match = p.sku?.match(/^PRD-(\d+)$/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    let nextNum = maxNum + 1
    let candidate = `PRD-${String(nextNum).padStart(3, '0')}`
    while (existingList.some((p) => p.sku?.toUpperCase() === candidate.toUpperCase())) {
      nextNum++
      candidate = `PRD-${String(nextNum).padStart(3, '0')}`
    }
    return candidate
  }

  // Open Add Product Modal with optional preselected category and auto-generated SKU
  const handleOpenAddModal = (defaultCategory?: string) => {
    setNewName('')
    setNewSku(generateAutoSku(products))
    setNewCategory(defaultCategory || openCategory || allCategoryNames[0] || 'Umum')
    setNewModal('')
    setNewPrice('')
    setNewStock('')
    setNewDescription('')
    setSelectedImageFile(null)
    setImagePreview(null)
    setShowAddModal(true)
  }

  // Category CRUD Handlers
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newCategoryName.trim()
    if (!trimmed) return

    setCategoryLoading(true)
    try {
      const res = await apiFetch<Category>('/categories', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.success && res.data) {
        setCategories((prev) => [...prev, res.data!])
        setNewCategoryName('')
        setSyncNotice({
          type: 'success',
          message: `Kategori "${res.data.name}" berhasil ditambahkan.`,
        })
        setTimeout(() => setSyncNotice(null), 3000)
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menambahkan kategori')
    } finally {
      setCategoryLoading(false)
    }
  }

  const handleUpdateCategory = async (cat: Category) => {
    const trimmed = editingCategoryName.trim()
    if (!trimmed || trimmed === cat.name) {
      setEditingCategoryId(null)
      return
    }

    setCategoryLoading(true)
    try {
      const res = await apiFetch<Category>(`/categories/${cat.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.success && res.data) {
        const updated = res.data
        setCategories((prev) => prev.map((c) => (c.id === cat.id ? updated : c)))
        setProducts((prev) =>
          prev.map((p) => (p.category === cat.name ? { ...p, category: updated.name } : p))
        )
        if (openCategory === cat.name) {
          setOpenCategory(updated.name)
        }
        setEditingCategoryId(null)
        setEditingCategoryName('')
        setSyncNotice({
          type: 'success',
          message: `Kategori berhasil diubah menjadi "${updated.name}".`,
        })
        setTimeout(() => setSyncNotice(null), 3000)
      }
    } catch (err: any) {
      alert(err.message || 'Gagal memperbarui kategori')
    } finally {
      setCategoryLoading(false)
    }
  }

  const handleDeleteCategory = async (cat: Category) => {
    if (
      !confirm(
        `Hapus kategori "${cat.name}"? Produk dalam kategori ini akan otomatis dipindahkan ke kategori "Umum".`
      )
    ) {
      return
    }

    setCategoryLoading(true)
    try {
      const res = await apiFetch(`/categories/${cat.id}`, {
        method: 'DELETE',
      })
      if (res.success) {
        setCategories((prev) => prev.filter((c) => c.id !== cat.id))
        setProducts((prev) =>
          prev.map((p) => (p.category === cat.name ? { ...p, category: 'Umum' } : p))
        )
        if (openCategory === cat.name) {
          setOpenCategory('Umum')
        }
        setSyncNotice({
          type: 'success',
          message: `Kategori "${cat.name}" berhasil dihapus. Produk dipindahkan ke "Umum".`,
        })
        setTimeout(() => setSyncNotice(null), 3000)
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus kategori')
    } finally {
      setCategoryLoading(false)
    }
  }

  // Handle image file selection for Add Product
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Mohon pilih file gambar yang valid (JPG, PNG, atau WebP).')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran gambar maksimal adalah 5MB.')
      return
    }

    setSelectedImageFile(file)
    const previewUrl = URL.createObjectURL(file)
    setImagePreview(previewUrl)
  }

  const handleRemoveImage = () => {
    setSelectedImageFile(null)
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
      setImagePreview(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle image file selection for Edit Product
  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Mohon pilih file gambar yang valid (JPG, PNG, atau WebP).')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran gambar maksimal adalah 5MB.')
      return
    }

    setEditSelectedImageFile(file)
    const previewUrl = URL.createObjectURL(file)
    setEditImagePreview(previewUrl)
  }

  const handleRemoveEditImage = () => {
    setEditSelectedImageFile(null)
    if (editImagePreview) {
      URL.revokeObjectURL(editImagePreview)
      setEditImagePreview(null)
    }
    setEditExistingImageUrl(null)
    if (editFileInputRef.current) {
      editFileInputRef.current.value = ''
    }
  }

  // Open Edit Modal
  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p)
    setEditName(p.name)
    setEditSku(p.sku)
    setEditCategory(p.category || 'Umum')
    setEditModal(p.modal !== undefined && p.modal !== null && p.modal !== 0 ? String(p.modal) : '')
    setEditPrice(String(p.price))
    setEditStock(String(p.stock))
    setEditDescription(p.description || '')
    setEditExistingImageUrl(p.imageUrl || null)
    setEditSelectedImageFile(null)
    setEditImagePreview(null)
  }

  const handleCloseEditModal = () => {
    setEditingProduct(null)
    setEditModal('')
    handleRemoveEditImage()
  }

  // Submit Add Product
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName || !newPrice) return

    setLoading(true)
    let uploadedImageUrl: string | null = null

    if (selectedImageFile) {
      setUploadingImage(true)
      try {
        const formData = new FormData()
        formData.append('image', selectedImageFile)

        const uploadRes = await apiFetch<{ url: string }>('/upload/product', {
          method: 'POST',
          body: formData,
        })

        if (uploadRes.success && uploadRes.url) {
          uploadedImageUrl = uploadRes.url
        } else if (uploadRes.data?.url) {
          uploadedImageUrl = uploadRes.data.url
        }
      } catch (uploadErr) {
        console.warn('Gagal mengunggah foto produk:', uploadErr)
      } finally {
        setUploadingImage(false)
      }
    }

    try {
      const finalSku = (newSku.trim() || generateAutoSku(products)).toUpperCase()
      const payload = {
        name: newName,
        sku: finalSku,
        category: newCategory || 'Umum',
        modal: Number(newModal) || 0,
        price: Number(newPrice) || 0,
        stock: Number(newStock) || 0,
        active: true,
        imageUrl: uploadedImageUrl,
        description: newDescription || null,
      }

      const res = await apiFetch<Product>('/katalog', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      if (res.success && res.data) {
        setProducts([res.data, ...products])
        setOpenCategory(res.data.category || 'Umum')
        if (res.data.waProductId) {
          setSyncNotice({
            type: 'success',
            message: `Produk "${res.data.name}" berhasil disimpan dan disinkronkan ke WhatsApp Bisnis.`,
          })
          setTimeout(() => setSyncNotice(null), 5000)
        }
      } else {
        const newProd: Product = {
          id: Date.now(),
          userUid: '',
          sku: payload.sku,
          name: payload.name,
          category: payload.category,
          modal: payload.modal,
          price: payload.price,
          stock: payload.stock,
          active: true,
          imageUrl: uploadedImageUrl,
          description: payload.description,
        }
        setProducts([newProd, ...products])
        setOpenCategory(newProd.category)
      }
    } catch {
      const finalSku = (newSku.trim() || generateAutoSku(products)).toUpperCase()
      const newProd: Product = {
        id: Date.now(),
        userUid: '',
        sku: finalSku,
        name: newName,
        category: newCategory || 'Umum',
        modal: Number(newModal) || 0,
        price: Number(newPrice) || 0,
        stock: Number(newStock) || 0,
        active: true,
        imageUrl: uploadedImageUrl,
      }
      setProducts([newProd, ...products])
      setOpenCategory(newProd.category)
    } finally {
      setLoading(false)
      setNewName('')
      setNewSku('')
      setNewCategory('')
      setNewModal('')
      setNewPrice('')
      setNewStock('')
      setNewDescription('')
      handleRemoveImage()
      setShowAddModal(false)
    }
  }

  // Submit Update Product
  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduct || !editName || !editPrice) return

    setUpdating(true)
    let finalImageUrl = editExistingImageUrl

    if (editSelectedImageFile) {
      try {
        const formData = new FormData()
        formData.append('image', editSelectedImageFile)

        const uploadRes = await apiFetch<{ url: string }>('/upload/product', {
          method: 'POST',
          body: formData,
        })

        if (uploadRes.success && uploadRes.url) {
          finalImageUrl = uploadRes.url
        } else if (uploadRes.data?.url) {
          finalImageUrl = uploadRes.data.url
        }
      } catch (uploadErr) {
        console.warn('Gagal mengunggah foto baru produk:', uploadErr)
      }
    }

    const finalSku = (editSku.trim() || editingProduct.sku || generateAutoSku(products)).toUpperCase()
    const payload = {
      name: editName,
      sku: finalSku,
      category: editCategory || 'Umum',
      modal: Number(editModal) || 0,
      price: Number(editPrice) || 0,
      stock: Number(editStock) || 0,
      description: editDescription || null,
      imageUrl: finalImageUrl,
    }

    try {
      const res = await apiFetch<Product>(`/katalog/${editingProduct.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })

      if (res.success && res.data) {
        setProducts(products.map((item) => (item.id === editingProduct.id ? res.data! : item)))
      } else {
        setProducts(
          products.map((item) =>
            item.id === editingProduct.id ? { ...item, ...payload } : item
          )
        )
      }

      setSyncNotice({
        type: 'success',
        message: `Produk "${editName}" berhasil diperbarui.`,
      })
      setTimeout(() => setSyncNotice(null), 4000)
    } catch {
      setProducts(
        products.map((item) =>
          item.id === editingProduct.id ? { ...item, ...payload } : item
        )
      )
    } finally {
      setUpdating(false)
      setEditModal('')
      handleCloseEditModal()
    }
  }

  // Execute deletion after modal confirmation
  const confirmDeleteProduct = async () => {
    if (!productToDelete) return
    setDeleting(true)

    try {
      await apiFetch(`/katalog/${productToDelete.id}`, { method: 'DELETE' })
      setProducts(products.filter((p) => p.id !== productToDelete.id))
      setSyncNotice({
        type: 'success',
        message: `Produk "${productToDelete.name}" berhasil dihapus.`,
      })
      setTimeout(() => setSyncNotice(null), 4000)
    } catch {
      setProducts(products.filter((p) => p.id !== productToDelete.id))
    } finally {
      setDeleting(false)
      setProductToDelete(null)
    }
  }

  const toggleActive = async (id: number) => {
    const target = products.find((p) => p.id === id)
    if (!target) return
    const nextState = !target.active

    setProducts(
      products.map((p) => (p.id === id ? { ...p, active: nextState } : p))
    )

    try {
      await apiFetch(`/katalog/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: nextState }),
      })
    } catch {}
  }

  // Batch sync all products to WhatsApp Business catalog
  const handleSyncToWhatsApp = async () => {
    setSyncingWa(true)
    setSyncNotice(null)

    try {
      const res = await apiFetch<any>('/katalog/sync-wa', {
        method: 'POST',
      })

      if (res.success) {
        setSyncNotice({
          type: 'success',
          message: res.message || 'Katalog berhasil disinkronkan ke WhatsApp Bisnis.',
        })
        await fetchProducts()
      } else {
        setSyncNotice({
          type: 'error',
          message: res.error || 'Gagal menyinkronkan katalog. Pastikan bot WhatsApp Bisnis terhubung.',
        })
      }
    } catch (err: any) {
      setSyncNotice({
        type: 'error',
        message: err.message || 'Terjadi kesalahan saat menyinkronkan katalog.',
      })
    } finally {
      setSyncingWa(false)
      setTimeout(() => setSyncNotice(null), 6000)
    }
  }

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/80 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Katalog Produk</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kelola produk, kategori, dan sinkronisasi ke WhatsApp Bisnis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCategoryModal(true)}
            className="text-xs cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Kelola Kategori</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncToWhatsApp}
            disabled={syncingWa}
            className="text-xs cursor-pointer"
            title="Sinkronkan semua produk ke katalog WhatsApp Bisnis"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingWa ? 'animate-spin' : ''}`} />
            <span>{syncingWa ? 'Menyinkronkan...' : 'Sinkron ke WA Bisnis'}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => handleOpenAddModal()}
            className="text-xs cursor-pointer bg-zinc-950 text-white hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Produk</span>
          </Button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncNotice && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            syncNotice.type === 'success'
              ? 'bg-zinc-900 text-white border-zinc-800'
              : 'bg-zinc-100 text-zinc-900 border-zinc-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-zinc-700 shrink-0" />
            )}
            <span>{syncNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncNotice(null)}
            className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, SKU, atau kategori..."
            className="pl-8 text-xs"
          />
        </div>
        <div className="text-xs text-zinc-500 font-mono flex items-center gap-4">
          <span>
            Kategori: <strong className="font-semibold text-zinc-900">{allCategoryNames.length}</strong>
          </span>
          <span>
            Total: <strong className="font-semibold text-zinc-900">{filteredProducts.length}</strong> produk
          </span>
        </div>
      </div>

      {/* Accordion Grouped by Category (Only 1 Accordion Open at a Time) */}
      <div className="space-y-3">
        {allCategoryNames.map((catName) => {
          const prods = filteredProducts.filter(
            (p) => (p.category || 'Umum').toLowerCase() === catName.toLowerCase()
          )

          // If search query is active and category has no matching products, hide category
          if (search.trim() && prods.length === 0) {
            return null
          }

          const isOpen = openCategory === catName

          return (
            <div
              key={catName}
              className="rounded-xl border border-zinc-200/90 bg-white shadow-xs overflow-hidden transition-all duration-150"
            >
              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => toggleCategory(catName)}
                className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors duration-200 cursor-pointer text-left select-none ${
                  isOpen ? 'bg-zinc-50/60' : 'bg-white hover:bg-zinc-50/75'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md bg-zinc-100 border border-zinc-200/80 flex items-center justify-center text-zinc-700 shrink-0">
                    <Tag className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-900 text-sm">{catName}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-zinc-100 text-zinc-600 border border-zinc-200/60">
                      {prods.length} produk
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ease-in-out ${
                      isOpen ? 'rotate-180 text-zinc-900' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Accordion Content with smooth expand/collapse transition */}
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-zinc-200/80">
                    {prods.length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-500">
                        <Package className="w-7 h-7 text-zinc-300 mx-auto mb-2" />
                        <p>Belum ada produk dalam kategori ini.</p>
                        <button
                          type="button"
                          onClick={() => handleOpenAddModal(catName)}
                          className="mt-2 text-xs font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700 cursor-pointer"
                        >
                          Tambah produk ke {catName}
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-zinc-50/80 border-b border-zinc-200/80 text-zinc-600 font-medium uppercase tracking-wider text-[10px]">
                            <tr>
                              <th className="px-4 py-2.5">Produk</th>
                              <th className="px-4 py-2.5 text-right">Modal</th>
                              <th className="px-4 py-2.5 text-right">Harga Jual</th>
                              <th className="px-4 py-2.5 text-center">Stok</th>
                              <th className="px-4 py-2.5 text-center">Status</th>
                              <th className="px-4 py-2.5 text-center">WA Bisnis</th>
                              <th className="px-4 py-2.5 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200/60">
                            {prods.map((p) => (
                              <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                                {/* Foto & Info */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    {p.imageUrl ? (
                                      <img
                                        src={p.imageUrl}
                                        alt={p.name}
                                        className="w-9 h-9 rounded-lg object-cover border border-zinc-200/90 shrink-0 shadow-2xs"
                                        onError={(e) => {
                                          ;(e.target as HTMLElement).style.display = 'none'
                                        }}
                                      />
                                    ) : (
                                      <div className="w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200/80 flex items-center justify-center text-zinc-400 shrink-0">
                                        <Package className="w-4 h-4" />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="font-medium text-zinc-900 truncate max-w-[220px]">
                                        {p.name}
                                      </div>
                                      <div className="text-[11px] font-mono text-zinc-500">{p.sku}</div>
                                    </div>
                                  </div>
                                </td>

                                {/* Modal */}
                                <td className="px-4 py-3 text-right font-mono text-zinc-500">
                                  {p.modal !== undefined && p.modal !== null && p.modal > 0
                                    ? `Rp ${p.modal.toLocaleString('id-ID')}`
                                    : '-'}
                                </td>

                                {/* Harga Jual */}
                                <td className="px-4 py-3 text-right font-mono font-medium text-zinc-900">
                                  Rp {p.price.toLocaleString('id-ID')}
                                </td>

                                {/* Stok */}
                                <td className="px-4 py-3 text-center font-mono text-zinc-700">{p.stock}</td>

                                {/* Status Ketersediaan */}
                                <td className="px-4 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => toggleActive(p.id)}
                                    className="cursor-pointer inline-flex items-center"
                                    title={p.active ? 'Klik untuk tandai Kosong' : 'Klik untuk tandai Tersedia'}
                                  >
                                    <Badge
                                      variant={p.active ? 'default' : 'outline'}
                                      className={cn(
                                        'text-[10px] px-2 py-0',
                                        !p.active && 'text-zinc-500 bg-zinc-50 border-zinc-200'
                                      )}
                                    >
                                      {p.active ? 'Tersedia' : 'Kosong'}
                                    </Badge>
                                  </button>
                                </td>

                                {/* WA Bisnis */}
                                <td className="px-4 py-3 text-center">
                                  {p.waProductId ? (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/80 shadow-2xs"
                                      title={`Tersinkron di katalog WA (ID: ${p.waProductId})`}
                                    >
                                      <Smartphone className="w-3 h-3" />
                                      <span>Tersinkron</span>
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-zinc-400 font-mono">-</span>
                                  )}
                                </td>

                                {/* Aksi */}
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditModal(p)}
                                      className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                                      title="Edit Produk"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setProductToDelete(p)}
                                      className="p-1.5 rounded-md text-zinc-400 hover:text-red-600 hover:bg-zinc-100 transition-colors cursor-pointer"
                                      title="Hapus Produk"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Empty Search Result */}
        {filteredProducts.length === 0 && (
          <Card className="p-8 text-center text-xs text-zinc-500 shadow-xs border-zinc-200/80">
            <Package className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
            <p>Tidak ada produk yang cocok dengan pencarian.</p>
          </Card>
        )}
      </div>

      {/* =========================================================================
          MODAL 1: KELOLA KATEGORI (CRUD)
          ========================================================================= */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border border-zinc-200 shadow-xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <h3 className="font-semibold text-sm text-zinc-950">Kelola Kategori</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">Tambah, ubah, atau hapus kategori produk Anda</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCategoryModal(false)
                  setEditingCategoryId(null)
                  setEditingCategoryName('')
                }}
                className="text-zinc-400 hover:text-zinc-900 text-sm cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Tambah Kategori Baru */}
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <Input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nama kategori baru..."
                className="text-xs"
                disabled={categoryLoading}
              />
              <Button
                type="submit"
                size="sm"
                disabled={categoryLoading || !newCategoryName.trim()}
                className="bg-zinc-950 hover:bg-zinc-800 text-white text-xs shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah</span>
              </Button>
            </form>

            {/* List Kategori */}
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {/* Default 'Umum' badge */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 border border-zinc-200/80 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900">Umum</span>
                  <span className="text-[10px] text-zinc-400 font-mono">(Kategori Bawaan)</span>
                </div>
                <span className="text-[11px] font-mono text-zinc-500">
                  {products.filter((p) => !p.category || p.category.toLowerCase() === 'umum').length} produk
                </span>
              </div>

              {categories.length === 0 ? (
                <p className="text-center py-4 text-xs text-zinc-400">
                  Belum ada kategori kustom. Tambahkan kategori baru di atas.
                </p>
              ) : (
                categories.map((cat) => {
                  const count = products.filter(
                    (p) => (p.category || '').toLowerCase() === cat.name.toLowerCase()
                  ).length
                  const isEditing = editingCategoryId === cat.id

                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-200 bg-white text-xs hover:border-zinc-300 transition-colors"
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-2 w-full">
                          <Input
                            type="text"
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            className="h-7 text-xs"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateCategory(cat)}
                            disabled={categoryLoading || !editingCategoryName.trim()}
                            className="p-1.5 rounded bg-zinc-950 text-white hover:bg-zinc-800 cursor-pointer"
                            title="Simpan"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(null)
                              setEditingCategoryName('')
                            }}
                            className="p-1.5 rounded text-zinc-400 hover:text-zinc-900 cursor-pointer"
                            title="Batal"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-zinc-900 truncate">{cat.name}</span>
                            <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                              ({count} produk)
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(cat.id)
                                setEditingCategoryName(cat.name)
                              }}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                              title="Edit nama kategori"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat)}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-red-600 hover:bg-zinc-100 transition-colors cursor-pointer"
                              title="Hapus kategori"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCategoryModal(false)
                  setEditingCategoryId(null)
                  setEditingCategoryName('')
                }}
                className="text-xs cursor-pointer"
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: KONFIRMASI HAPUS PRODUK
          ========================================================================= */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 select-none">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 border border-zinc-200 shadow-xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-semibold text-sm text-zinc-950">Konfirmasi Hapus Produk</h3>
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="text-zinc-400 hover:text-zinc-900 text-sm cursor-pointer"
                disabled={deleting}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-zinc-600 space-y-2">
              <p>Apakah Anda yakin ingin menghapus produk ini?</p>
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80">
                <p className="font-medium text-zinc-950">{productToDelete.name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono text-zinc-500 mt-1">
                  <span>SKU: {productToDelete.sku}</span>
                  {productToDelete.modal !== undefined && productToDelete.modal !== null && productToDelete.modal > 0 && (
                    <span>Modal: Rp {productToDelete.modal.toLocaleString('id-ID')}</span>
                  )}
                  <span>Jual: Rp {productToDelete.price.toLocaleString('id-ID')}</span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">
                Tindakan ini akan menghapus produk dari database dan katalog WhatsApp Bisnis.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setProductToDelete(null)}
                disabled={deleting}
                className="text-xs cursor-pointer"
              >
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={confirmDeleteProduct}
                disabled={deleting}
                className="bg-zinc-950 hover:bg-zinc-800 text-white text-xs cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Hapus Produk'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: TAMBAH PRODUK BARU
          ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border border-zinc-200 shadow-xl space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-semibold text-sm text-zinc-950">Tambah Produk Baru</h3>
              <button
                type="button"
                onClick={() => {
                  handleRemoveImage()
                  setShowAddModal(false)
                }}
                className="text-zinc-400 hover:text-zinc-900 text-sm cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-3.5 text-xs">
              {/* Upload Foto Produk */}
              <div>
                <label className="block text-zinc-700 mb-1.5 font-medium">Foto Produk</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                />

                {imagePreview ? (
                  <div className="relative rounded-lg border border-zinc-200 overflow-hidden bg-zinc-50 p-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={imagePreview}
                        alt="Preview Produk"
                        className="w-12 h-12 rounded-md object-cover border border-zinc-200"
                      />
                      <div className="text-[11px]">
                        <p className="font-medium text-zinc-900 truncate max-w-[220px]">
                          {selectedImageFile?.name}
                        </p>
                        <p className="text-zinc-500 font-mono">
                          {selectedImageFile ? (selectedImageFile.size / 1024).toFixed(0) + ' KB' : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors cursor-pointer"
                      title="Hapus foto"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-zinc-300 hover:border-zinc-500 rounded-lg p-3 text-center cursor-pointer transition-colors bg-zinc-50/50 hover:bg-zinc-100/50"
                  >
                    <div className="flex flex-col items-center gap-1 text-zinc-500">
                      <Upload className="w-4 h-4 text-zinc-400" />
                      <span className="text-xs font-medium text-zinc-700">Pilih foto produk</span>
                      <span className="text-[10px] text-zinc-400">JPG, PNG, atau WebP (Maks. 5MB)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Nama Produk */}
              <div>
                <label className="block text-zinc-700 mb-1 font-medium">Nama Produk</label>
                <Input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Contoh: Kopi Luwak 200g"
                  required
                />
              </div>

              {/* Dropdown Kategori */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-zinc-700 font-medium">Kategori</label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(true)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-950 underline underline-offset-2 cursor-pointer"
                  >
                    + Kelola
                  </button>
                </div>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-md border border-zinc-200 bg-white text-xs text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
                >
                  {allCategoryNames.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Modal, Harga Jual & Stok */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-zinc-700 mb-1 font-medium">Harga Modal (Rp)</label>
                  <Input
                    type="number"
                    value={newModal}
                    onChange={(e) => setNewModal(e.target.value)}
                    placeholder="50000"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 mb-1 font-medium">Harga Jual (Rp)</label>
                  <Input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="75000"
                    required
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 mb-1 font-medium">Stok Awal</label>
                  <Input
                    type="number"
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    placeholder="50"
                  />
                </div>
              </div>

              {/* Deskripsi Produk */}
              <div>
                <label className="block text-zinc-700 mb-1 font-medium">Deskripsi (Opsional)</label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Deskripsi singkat produk untuk informasi pemesanan WhatsApp"
                  className="w-full px-3 py-2 rounded-md border border-zinc-200 bg-white text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-zinc-950 resize-none"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleRemoveImage()
                    setShowAddModal(false)
                  }}
                  disabled={loading || uploadingImage}
                  className="text-xs cursor-pointer"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={loading || uploadingImage}
                  className="bg-zinc-950 hover:bg-zinc-800 text-white text-xs cursor-pointer"
                >
                  {uploadingImage ? 'Mengunggah Foto...' : loading ? 'Menyimpan...' : 'Simpan Produk'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: EDIT PRODUK
          ========================================================================= */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border border-zinc-200 shadow-xl space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-semibold text-sm text-zinc-950">Edit Produk</h3>
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="text-zinc-400 hover:text-zinc-900 text-sm cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateProduct} className="space-y-3.5 text-xs">
              {/* Foto Produk di Edit Modal */}
              <div>
                <label className="block text-zinc-700 mb-1.5 font-medium">Foto Produk</label>
                <input
                  type="file"
                  ref={editFileInputRef}
                  onChange={handleEditImageChange}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                />

                {editImagePreview || editExistingImageUrl ? (
                  <div className="relative rounded-lg border border-zinc-200 overflow-hidden bg-zinc-50 p-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={editImagePreview || editExistingImageUrl!}
                        alt="Preview Produk"
                        className="w-12 h-12 rounded-md object-cover border border-zinc-200"
                      />
                      <div className="text-[11px]">
                        <p className="font-medium text-zinc-900 truncate max-w-[200px]">
                          {editSelectedImageFile ? editSelectedImageFile.name : 'Foto Produk Terpasang'}
                        </p>
                        <p className="text-zinc-500 font-mono">
                          {editSelectedImageFile
                            ? (editSelectedImageFile.size / 1024).toFixed(0) + ' KB (Baru)'
                            : 'Tersimpan di server'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 transition-colors cursor-pointer text-[11px]"
                        title="Ganti foto"
                      >
                        Ganti
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveEditImage}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors cursor-pointer"
                        title="Hapus foto"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => editFileInputRef.current?.click()}
                    className="border border-dashed border-zinc-300 hover:border-zinc-500 rounded-lg p-3 text-center cursor-pointer transition-colors bg-zinc-50/50 hover:bg-zinc-100/50"
                  >
                    <div className="flex flex-col items-center gap-1 text-zinc-500">
                      <Upload className="w-4 h-4 text-zinc-400" />
                      <span className="text-xs font-medium text-zinc-700">Unggah foto produk</span>
                      <span className="text-[10px] text-zinc-400">JPG, PNG, atau WebP (Maks. 5MB)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Nama Produk */}
              <div>
                <label className="block text-zinc-700 mb-1 font-medium">Nama Produk</label>
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Contoh: Kopi Luwak 200g"
                  required
                />
              </div>

              {/* Dropdown Kategori */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-zinc-700 font-medium">Kategori</label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(true)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-950 underline underline-offset-2 cursor-pointer"
                  >
                    + Kelola
                  </button>
                </div>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-md border border-zinc-200 bg-white text-xs text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
                >
                  {allCategoryNames.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Modal, Harga Jual & Stok */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-zinc-700 mb-1 font-medium">Harga Modal (Rp)</label>
                  <Input
                    type="number"
                    value={editModal}
                    onChange={(e) => setEditModal(e.target.value)}
                    placeholder="50000"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 mb-1 font-medium">Harga Jual (Rp)</label>
                  <Input
                    type="number"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    placeholder="75000"
                    required
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 mb-1 font-medium">Stok</label>
                  <Input
                    type="number"
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    placeholder="50"
                  />
                </div>
              </div>

              {/* Deskripsi Produk */}
              <div>
                <label className="block text-zinc-700 mb-1 font-medium">Deskripsi (Opsional)</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Deskripsi singkat produk untuk informasi pemesanan WhatsApp"
                  className="w-full px-3 py-2 rounded-md border border-zinc-200 bg-white text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-zinc-950 resize-none"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseEditModal}
                  disabled={updating}
                  className="text-xs cursor-pointer"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updating}
                  className="bg-zinc-950 hover:bg-zinc-800 text-white text-xs cursor-pointer"
                >
                  {updating ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
