import { supabase } from '@/lib/supabase';

export type StaffRole = 'staff' | 'admin';

const ADMIN_SETUP_PIN = process.env.NEXT_PUBLIC_ADMIN_SETUP_PIN ?? '';

export interface StaffAccount {
  id: string;
  display_name: string;
  name: string;
  pin?: string;
  role: StaffRole;
  is_active: boolean;
  created_at?: string;
  last_login_at?: string;
}

export const CURRENT_STAFF_KEY = 'festival_pos_current_staff';

function withoutPin(staff: StaffAccount): StaffAccount {
  const sessionStaff = { ...staff };
  delete sessionStaff.pin;
  return sessionStaff;
}

export function getCurrentStaff(): StaffAccount | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CURRENT_STAFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StaffAccount;
  } catch (error) {
    console.error('current staff parse error:', error);
    return null;
  }
}

export function setCurrentStaff(staff: StaffAccount | null) {
  if (typeof window === 'undefined') return;

  if (!staff) {
    localStorage.removeItem(CURRENT_STAFF_KEY);
    return;
  }

  localStorage.setItem(CURRENT_STAFF_KEY, JSON.stringify(withoutPin(staff)));
}

const STAFF_PUBLIC_COLUMNS = 'id,display_name,name,role,is_active,created_at,last_login_at';

export async function getStaffById(id: string): Promise<StaffAccount | null> {
  const { data, error } = await supabase
    .from('staffs')
    .select(STAFF_PUBLIC_COLUMNS)
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('staff session validation error:', error.message);
    return null;
  }

  return data as StaffAccount | null;
}

export async function fetchStaffAccounts(): Promise<StaffAccount[]> {
  const { data, error } = await supabase
    .from('staffs')
    .select(STAFF_PUBLIC_COLUMNS)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('staffs fetch error:', error.message);
    return [];
  }

  return (data ?? []) as StaffAccount[];
}

export async function createStaffAccount(input: {
  display_name: string;
  name: string;
  pin: string;
  role: StaffRole;
  admin_setup_pin?: string;
}) {
  const displayName = input.display_name.trim();
  const name = input.name.trim();
  const pin = input.pin.trim();

  if (!displayName || !pin) {
    throw new Error('表示名とPINは必須です。');
  }

  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('PINは4〜6桁の数字で入力してください。');
  }

  if (input.role === 'admin') {
    if (!ADMIN_SETUP_PIN || ADMIN_SETUP_PIN === 'CHANGE_ME') {
      throw new Error('管理者作成PINが設定されていません。環境設定を確認してください。');
    }
    if (input.admin_setup_pin !== ADMIN_SETUP_PIN) {
      throw new Error('管理者作成PINが一致しません。');
    }
  }

  const { data, error } = await supabase
    .from('staffs')
    .insert({
      display_name: displayName,
      name: name || displayName,
      pin,
      role: input.role,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message || 'アカウント作成に失敗しました。');
  }

  return data as StaffAccount;
}

export async function loginStaff(input: { name: string; pin: string }) {
  const normalizedName = input.name.trim();
  const pin = input.pin.trim();

  if (!normalizedName || !pin) {
    throw new Error('名前とPINを入力してください。');
  }

  const { data, error } = await supabase
    .from('staffs')
    .select('*')
    .eq('name', normalizedName)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'ログインに失敗しました。');
  }

  if (!data) {
    throw new Error('該当するアカウントが見つかりません。');
  }

  if (String(data.pin) !== pin) {
    throw new Error('PINが一致しません。');
  }

  await supabase
    .from('staffs')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', data.id);

  return withoutPin(data as StaffAccount);
}
