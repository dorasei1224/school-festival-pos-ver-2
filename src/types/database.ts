export interface Product {
  id: string;
  name: string;
  category: string;
  base_price: number;
  current_price: number;
  stock: number;
  created_at?: string;
}

export interface Staff {
  id: string;
  display_name: string;
  name: string;
  pin: string;
  role: 'staff' | 'admin';
  is_active: boolean;
  created_at?: string;
  last_login_at?: string;
}

export interface Order {
  id: string;
  order_number: number;
  staff_id?: string;
  staff_name: string;
  status: string;
  total_amount: number;
  received_amount: number;
  change_amount: number;
  created_at?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}