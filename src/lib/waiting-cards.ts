import { supabase } from './supabase';

export interface WaitingCard {
  id: number;
  number: number;
  status: 'available' | 'assigned';
  assignedOrderKey?: string;
  assignedAt?: string;
}

const WAITING_CARD_KEY = 'pos_waiting_cards';

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function syncWaitingCardToSupabase(orderKey: string, waitingNumber: number) {
  if (!isUuidLike(orderKey)) return;

  try {
    const { error } = await supabase
      .from('waiting_cards')
      .upsert(
        {
          order_id: orderKey,
          waiting_number: waitingNumber,
          status: 'assigned',
          assigned_at: new Date().toISOString(),
        },
        { onConflict: 'order_id' }
      );

    if (error) {
      console.error('待合番号のDB保存に失敗しました:', error.message);
    }
  } catch (error) {
    console.error('待合番号のDB保存中に例外が発生しました:', error);
  }
}

async function releaseWaitingCardInSupabase(orderKey: string) {
  if (!isUuidLike(orderKey)) return;

  try {
    const { error } = await supabase
      .from('waiting_cards')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
      })
      .eq('order_id', orderKey);

    if (error) {
      console.error('待合番号の解放に失敗しました:', error.message);
    }
  } catch (error) {
    console.error('待合番号の解放中に例外が発生しました:', error);
  }
}

export async function cleanupStaleWaitingCards(): Promise<void> {
  try {
    const { data: orderRows, error: orderError } = await supabase
      .from('orders')
      .select('id, status');

    if (orderError) {
      console.error('待合番号の整合性確認に失敗しました:', orderError.message);
      return;
    }

    const knownOrderIds = new Set((orderRows ?? []).map((order) => String(order.id)));

    const { data: cardRows, error: cardError } = await supabase
      .from('waiting_cards')
      .select('order_id, status');

    if (cardError) {
      console.error('待合番号の未整合確認に失敗しました:', cardError.message);
      return;
    }

    const staleAssignments = (cardRows ?? []).filter((card) => {
      if (card.status !== 'assigned') return false;
      if (!card.order_id) return true;
      const orderId = String(card.order_id);
      if (!knownOrderIds.has(orderId)) return true;

      const order = (orderRows ?? []).find((row) => String(row.id) === orderId);
      return String(order?.status ?? '').toLowerCase() === 'cancelled';
    });

    for (const card of staleAssignments) {
      if (!card.order_id) continue;

      const { error: updateError } = await supabase
        .from('waiting_cards')
        .update({
          status: 'released',
          released_at: new Date().toISOString(),
        })
        .eq('order_id', String(card.order_id));

      if (updateError) {
        console.error('古い待合番号の解放に失敗しました:', updateError.message);
      }
    }
  } catch (error) {
    console.error('待合番号の整合性チェック中に例外が発生しました:', error);
  }
}

export async function ensureActiveWaitingCardAssignments(): Promise<void> {
  try {
    const { data: orderRows, error: orderError } = await supabase
      .from('orders')
      .select('id, status');

    if (orderError) {
      console.error('待合番号の補完のための注文取得に失敗しました:', orderError.message);
      return;
    }

    const activeOrderIds = (orderRows ?? [])
      .filter((order) => ['pending', 'ready', 'preparing'].includes(String(order.status ?? '').toLowerCase()))
      .map((order) => String(order.id));

    if (activeOrderIds.length === 0) return;

    const { data: cardRows, error: cardError } = await supabase
      .from('waiting_cards')
      .select('order_id, waiting_number, status');

    if (cardError) {
      console.error('待合番号の補完のためのカード取得に失敗しました:', cardError.message);
      return;
    }

    const assignedMap = new Map<string, number>();
    for (const row of cardRows ?? []) {
      if (row.order_id && row.waiting_number != null && row.status === 'assigned') {
        assignedMap.set(String(row.order_id), Number(row.waiting_number));
      }
    }

    const missingAssignments = activeOrderIds.filter((orderId) => !assignedMap.has(orderId));
    if (missingAssignments.length === 0) return;

    const occupiedNumbers = new Set(Array.from(assignedMap.values()));
    const candidateNumbers = Array.from({ length: 10 }, (_, index) => index + 1).filter((number) => !occupiedNumbers.has(number));

    for (let index = 0; index < missingAssignments.length; index += 1) {
      const orderId = missingAssignments[index];
      const waitingNumber = candidateNumbers[index] ?? null;
      if (!waitingNumber) break;

      const { error: upsertError } = await supabase
        .from('waiting_cards')
        .upsert(
          {
            order_id: orderId,
            waiting_number: waitingNumber,
            status: 'assigned',
            assigned_at: new Date().toISOString(),
          },
          { onConflict: 'order_id' }
        );

      if (upsertError) {
        console.error('待合番号の補完に失敗しました:', upsertError.message);
      }
    }
  } catch (error) {
    console.error('待合番号の補完中に例外が発生しました:', error);
  }
}

export async function loadWaitingCardsFromSupabase(): Promise<WaitingCard[]> {
  try {
    const { data, error } = await supabase
      .from('waiting_cards')
      .select('order_id, waiting_number, status, assigned_at')
      .order('waiting_number', { ascending: true });

    if (error) {
      console.error('待合番号のDB取得に失敗しました:', error.message);
      return getDefaultWaitingCards();
    }

    const assigned = new Map<string, number>();
    for (const row of data ?? []) {
      const amount = Number(row.waiting_number);
      if (row.status === 'assigned' && row.order_id) {
        assigned.set(String(row.order_id), amount);
      }
    }

    const cards = Array.from({ length: 10 }, (_, index) => {
      const number = index + 1;
      const orderKey = [...assigned.entries()].find(([, candidate]) => candidate === number)?.[0];
      return {
        id: number,
        number,
        status: orderKey ? 'assigned' : 'available',
        assignedOrderKey: orderKey,
        assignedAt: data?.find((row) => Number(row.waiting_number) === number && row.order_id === orderKey)?.assigned_at,
      } satisfies WaitingCard;
    });

    saveWaitingCards(cards);
    return cards;
  } catch (error) {
    console.error('待合番号のDB読込中に例外が発生しました:', error);
    return getDefaultWaitingCards();
  }
}

export function getDefaultWaitingCards(): WaitingCard[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    number: index + 1,
    status: 'available',
  }));
}

export function ensureWaitingCards(): WaitingCard[] {
  if (typeof window === 'undefined') return getDefaultWaitingCards();

  try {
    const stored = window.localStorage.getItem(WAITING_CARD_KEY);
    if (!stored) {
      const defaultCards = getDefaultWaitingCards();
      window.localStorage.setItem(WAITING_CARD_KEY, JSON.stringify(defaultCards));
      return defaultCards;
    }

    const parsed = JSON.parse(stored) as Partial<WaitingCard>[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const defaultCards = getDefaultWaitingCards();
      window.localStorage.setItem(WAITING_CARD_KEY, JSON.stringify(defaultCards));
      return defaultCards;
    }

    const normalized: WaitingCard[] = parsed.map((card, index) => ({
      id: card.id ?? index + 1,
      number: card.number ?? index + 1,
      status: card.status === 'assigned' ? 'assigned' : 'available',
      assignedOrderKey: card.assignedOrderKey,
      assignedAt: card.assignedAt,
    }));

    window.localStorage.setItem(WAITING_CARD_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    console.error('待合カードの読み込みに失敗しました:', error);
    const fallback = getDefaultWaitingCards();
    window.localStorage.setItem(WAITING_CARD_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

export function saveWaitingCards(cards: WaitingCard[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(WAITING_CARD_KEY, JSON.stringify(cards));
}

export function getWaitingCards(): WaitingCard[] {
  return ensureWaitingCards();
}

export function getAvailableWaitingCards(): WaitingCard[] {
  return getWaitingCards().filter((card) => card.status === 'available');
}

export function getAvailableWaitingNumbers(): number[] {
  return getAvailableWaitingCards().map((card) => card.number);
}

export async function reserveWaitingCard(orderKey: string | number, preferredNumber?: number | null): Promise<number | null> {
  const normalizedOrderKey = String(orderKey);

  try {
    await cleanupStaleWaitingCards();

    const preferredNumberIsRangeValid = preferredNumber != null
      && Number.isInteger(preferredNumber)
      && preferredNumber >= 1
      && preferredNumber <= 10;

    if (!preferredNumberIsRangeValid) {
      await ensureActiveWaitingCardAssignments();
    }

    const { data, error } = await supabase
      .from('waiting_cards')
      .select('order_id, waiting_number, status')
      .order('waiting_number', { ascending: true });

    if (error) {
      console.error('待合番号のDB取得に失敗しました:', error.message);
      return null;
    }

    const existingAssignment = (data ?? []).find((row) => row.order_id === normalizedOrderKey && row.status === 'assigned');
    if (existingAssignment && existingAssignment.waiting_number != null) {
      return Number(existingAssignment.waiting_number);
    }

    const occupied = new Set(
      (data ?? [])
        .filter((row) => row.order_id !== normalizedOrderKey && row.status === 'assigned')
        .map((row) => Number(row.waiting_number))
    );

    const preferredNumberIsAvailable = preferredNumberIsRangeValid && !occupied.has(preferredNumber!);
    const candidates = Array.from({ length: 10 }, (_, index) => index + 1).filter((number) => !occupied.has(number));
    const chosen = preferredNumberIsAvailable
      ? preferredNumber
      : candidates[0] ?? null;

    if (chosen === null) return null;

    const { error: upsertError } = await supabase
      .from('waiting_cards')
      .upsert(
        {
          order_id: normalizedOrderKey,
          waiting_number: chosen,
          status: 'assigned',
          assigned_at: new Date().toISOString(),
        },
        { onConflict: 'order_id' }
      );

    if (upsertError) {
      console.error('待合番号の割り当てに失敗しました:', upsertError.message);
      return null;
    }

    const cards: WaitingCard[] = Array.from({ length: 10 }, (_, index) => {
      const number = index + 1;
      const row = (data ?? []).find((entry) => Number(entry.waiting_number) === number && entry.status === 'assigned');

      if (number === chosen) {
        return {
          id: number,
          number,
          status: 'assigned',
          assignedOrderKey: normalizedOrderKey,
          assignedAt: new Date().toISOString(),
        } satisfies WaitingCard;
      }

      if (row && row.order_id) {
        return {
          id: number,
          number,
          status: 'assigned',
          assignedOrderKey: String(row.order_id),
          assignedAt: new Date().toISOString(),
        } satisfies WaitingCard;
      }

      return {
        id: number,
        number,
        status: 'available',
        assignedOrderKey: undefined,
        assignedAt: undefined,
      } satisfies WaitingCard;
    });

    saveWaitingCards(cards);
    return chosen;
  } catch (error) {
    console.error('待合番号の割り当て中に例外が発生しました:', error);
    return null;
  }
}

export function getWaitingNumberByOrderKey(orderKey: string | number): number | null {
  const match = getWaitingCards().find((card) => card.assignedOrderKey === String(orderKey));
  return match?.number ?? null;
}

export async function releaseWaitingCard(orderKey: string | number) {
  const normalizedOrderKey = String(orderKey);
  const cards = getWaitingCards();
  const updated: WaitingCard[] = cards.map((card) =>
    card.assignedOrderKey === normalizedOrderKey
      ? {
          ...card,
          status: 'available',
          assignedOrderKey: undefined,
          assignedAt: undefined,
        }
      : card
  );

  saveWaitingCards(updated);
  await releaseWaitingCardInSupabase(normalizedOrderKey);
}

export function addWaitingCard(): number {
  const cards = getWaitingCards();
  const nextNumber = cards.length > 0 ? Math.max(...cards.map((card) => card.number)) + 1 : 1;
  const nextCard: WaitingCard = {
    id: Date.now(),
    number: nextNumber,
    status: 'available',
  };

  const updated = [...cards, nextCard];
  saveWaitingCards(updated);
  return nextNumber;
}
