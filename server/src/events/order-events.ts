import { EventEmitter } from 'node:events'

export interface OrderEventPayload {
  userUid?: string | null
  orderUid?: string
  type: 'created' | 'proof_uploaded' | 'name_updated' | 'status_changed'
  timestamp?: number
}

class OrderEventEmitter extends EventEmitter {
  public notifyOrderChange(payload: OrderEventPayload) {
    this.emit('order_change', {
      ...payload,
      timestamp: payload.timestamp || Date.now(),
    })
  }
}

export const orderEventEmitter = new OrderEventEmitter()
