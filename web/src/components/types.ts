export interface UserStore {
  id: number
  storeUseruid: string
  name: string
  location?: string | null
  description?: string | null
  status: 'pending' | 'approved' | 'rejected'
  telegramBotToken?: string | null
  telegramBotUsername?: string | null
  telegramActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface User {
  id: number
  uid?: string
  name: string
  storeName?: string
  username: string
  email: string
  phone?: string | null
  profileUrl?: string
  role?: 'admin' | 'user'
}

export interface Product {
  id: number
  storeId?: number
  userUid?: string
  sku: string
  name: string
  category: string
  modal?: number
  price: number
  stock: number
  active: boolean
  imageUrl?: string | null
  waProductId?: string | null
  description?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface Category {
  id: number
  uid: string
  name: string
  createdAt?: string
  updatedAt?: string
}

export interface SessionInfo {
  sessionId: string
  userName: string
  phoneNumber: string | null
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
  qrCode: string | null
  qrDataUrl: string | null
  isBusiness?: boolean
  errorMessage?: string | null
  updatedAt?: string
}

export interface ChatMessage {
  id?: number
  session_id?: string
  sessionId?: string
  sender: string
  recipient: string
  message_text?: string
  text?: string
  is_from_me?: boolean | number
  isFromMe?: boolean
  timestamp?: string
}
