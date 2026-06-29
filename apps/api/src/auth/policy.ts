import type { Role } from '@app/db';

/** The authenticated caller, derived from a verified token. */
export interface Principal {
  id: string;
  role: Role;
  email: string;
}

/** The minimal slice of an order needed to make an authorization decision. */
export interface OrderRef {
  customer_id: string;
  merchant_id: string;
}

/**
 * Who can view an order: admins see any; customers see their own; merchants see
 * orders placed with them. Authorization decisions are kept as pure functions,
 * separate from the HTTP layer.
 */
export function canViewOrder(user: Principal, order: OrderRef): boolean {
  switch (user.role) {
    case 'admin':
      return true;
    case 'customer':
      return order.customer_id === user.id;
    case 'merchant':
      return order.merchant_id === user.id;
    default:
      return false;
  }
}

/**
 * Who can refund an order: admins may refund any order; a merchant may refund only orders
 * placed with them. Customers receive the resulting store credit but never issue refunds.
 */
export function canRefundOrder(user: Principal, order: OrderRef): boolean {
  switch (user.role) {
    case 'admin':
      return true;
    case 'merchant':
      return order.merchant_id === user.id;
    default:
      return false;
  }
}
