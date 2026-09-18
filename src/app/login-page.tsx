'use client';

import { useEffect, useState } from 'react';
import { createStaffAccount, fetchStaffAccounts, loginStaff, setCurrentStaff, StaffAccount } from '@/lib/staff-auth';
import { HelpButton, TutorialModal, hasSeenTutorial, markTutorialSeen, type TutorialStep } from '@/components/TutorialModal';

export default function StaffLoginPage({
  onLogin,
}: {
  onLogin: (staff: StaffAccount) => void;
}) {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [mode, setMode] = useState<'login' | 'create'>('login');
  const [displayName, setDisplayName] = useState('');
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [adminSetupPin, setAdminSetupPin] = useState('');
  const [showAdminSetupPin, setShowAdminSetupPin] = useState(false);
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);

  const loginTutorialSteps: TutorialStep[] = [
    { id: 'login-staff-select', title: 'スタッフを選ぶ', subtitle: 'ログインする人を選択します', description: '最初にログインするスタッフ名を選んでください。ここで担当者を切り替えます。', targetId: 'login-staff-select', align: 'right' },
    { id: 'login-pin', title: 'PINを入力', subtitle: '4〜6桁の暗証番号を入力します', description: 'PINを入力してからログインを押せば、担当者として画面を開けます。', targetId: 'login-pin-input', align: 'left' },
    { id: 'login-submit', title: 'ログインして開始', subtitle: '最後にログインを押します', description: 'ログインできたら、レジ画面や管理画面へ進めます。', targetId: 'login-submit-button', align: 'right' },
  ];
  const createTutorialSteps: TutorialStep[] = [
    { id: 'login-create-tab', title: '新規作成を選ぶ', subtitle: 'アカウント作成の入力画面へ切り替えます', description: '新規作成タブを押すと、スタッフのアカウント作成フォームが出てきます。', targetId: 'login-create-tab', align: 'left' },
    { id: 'login-create-name', title: '表示名を決める', subtitle: 'スタッフとして表示される名前を入力します', description: '表示名とログイン名を設定して、スタッフの識別をしやすくします。', targetId: 'login-create-display-name', align: 'right' },
    { id: 'login-create-submit', title: 'アカウントを登録', subtitle: '最後に作成してログインします', description: 'PINと役割を確認して、アカウントを作成してログインを進めます。', targetId: 'login-create-submit-button', align: 'right' },
  ];

  const activeLoginSteps = mode === 'create' ? createTutorialSteps : loginTutorialSteps;

  const startTutorialForCurrentMode = (nextMode: 'login' | 'create') => {
    setMode(nextMode);
    setTutorialStepIndex(0);
    setShowTutorial(true);
  };

  useEffect(() => {
    if (!hasSeenTutorial()) {
      markTutorialSeen();
      setShowTutorial(true);
      setTutorialStepIndex(0);
    }
  }, []);

  useEffect(() => {
    if (!showTutorial || tutorialStepIndex === 0) return;
    const target = document.getElementById(activeLoginSteps[tutorialStepIndex]?.targetId ?? '');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showTutorial, tutorialStepIndex, activeLoginSteps]);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const staffAccounts = await fetchStaffAccounts();
        setAccounts(staffAccounts);
        if (staffAccounts.length > 0) {
          setSelectedName(staffAccounts[0].name);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    void loadAccounts();
  }, []);

  const handleLogin = async () => {
    setError('');
    if (!selectedName || !pin) {
      setError('名前とPINを入力してください。');
      return;
    }

    try {
      const staff = await loginStaff({ name: selectedName, pin });
      setCurrentStaff(staff);
      onLogin(staff);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ログインに失敗しました。');
    }
  };

  const handleCreate = async () => {
    setError('');

    if (!displayName || !newPin) {
      setError('表示名とPINを入力してください。');
      return;
    }

    try {
      const staff = await createStaffAccount({
        display_name: displayName,
        name: newName || displayName,
        pin: newPin,
        role,
        admin_setup_pin: role === 'admin' ? adminSetupPin : undefined,
      });

      const updated = await fetchStaffAccounts();
      setAccounts(updated);
      setCurrentStaff(staff);
      onLogin(staff);
    } catch (e) {
      setError(e instanceof Error ? e.message : '作成に失敗しました。');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] text-neutral-700">
        <div className="text-sm font-bold">スタッフ情報を読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-6">
      <TutorialModal
        open={showTutorial}
        onClose={() => setShowTutorial(false)}
        steps={activeLoginSteps}
        stepIndex={tutorialStepIndex}
        onStepChange={setTutorialStepIndex}
      />

      <div className="w-full max-w-md bg-white border border-neutral-200 rounded-3xl shadow-xl p-6">
        <div className="mb-6 flex items-start justify-between gap-3 text-center">
          <div className="flex-1 text-center">
            <p className="text-[10px] font-bold text-neutral-500 tracking-[0.2em] uppercase">Festival POS</p>
            <h1 className="mt-2 text-2xl font-black text-neutral-900">スタッフログイン</h1>
          </div>
          <HelpButton onClick={() => setShowTutorial(true)} className="shrink-0" />
        </div>

        <div className="flex mb-5 rounded-xl bg-neutral-100 p-1">
          <button
            type="button"
            onClick={() => startTutorialForCurrentMode('login')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${mode === 'login' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
          >
            ログイン
          </button>
          <button
            id="login-create-tab"
            type="button"
            onClick={() => startTutorialForCurrentMode('create')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${mode === 'create' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
          >
            新規作成
          </button>
        </div>

        {mode === 'login' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-neutral-500 mb-1">スタッフ名</label>
              <select
                id="login-staff-select"
                value={selectedName}
                onChange={(e) => setSelectedName(e.target.value)}
                className="w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 focus:outline-none focus:border-neutral-900"
              >
                {accounts.length === 0 ? (
                  <option value="">アカウントがありません</option>
                ) : (
                  accounts.map((account) => (
                    <option key={account.id} value={account.name}>
                      {account.display_name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-500 mb-1">PIN</label>
              <div className="relative">
                <input
                  id="login-pin-input"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="4〜6桁"
                  className="w-full px-3 py-2.5 pr-16 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 focus:outline-none focus:border-neutral-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((visible) => !visible)}
                  aria-label={showPin ? 'PINを隠す' : 'PINを表示'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-bold text-neutral-500 hover:text-neutral-900"
                >
                  {showPin ? '隠す' : '表示'}
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

            <button
              id="login-submit-button"
              onClick={handleLogin}
              className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-bold rounded-xl transition"
            >
              ログインしてPOSを開始
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-neutral-500 mb-1">表示名</label>
              <input
                id="login-create-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 focus:outline-none focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-500 mb-1">ログイン名（英数字推奨）</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="yamada"
                className="w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 focus:outline-none focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-500 mb-1">PIN</label>
              <div className="relative">
                <input
                  type={showNewPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="4〜6桁"
                  className="w-full px-3 py-2.5 pr-16 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 focus:outline-none focus:border-neutral-900"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin((visible) => !visible)}
                  aria-label={showNewPin ? '作成PINを隠す' : '作成PINを表示'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-bold text-neutral-500 hover:text-neutral-900"
                >
                  {showNewPin ? '隠す' : '表示'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-500 mb-1">役割</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'staff' | 'admin')}
                className="w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 focus:outline-none focus:border-neutral-900"
              >
                <option value="staff">スタッフ</option>
                <option value="admin">管理者</option>
              </select>
            </div>

            {role === 'admin' && (
              <div>
                <label className="block text-[11px] font-bold text-neutral-500 mb-1">管理者作成PIN</label>
                <div className="relative">
                  <input
                    type={showAdminSetupPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={adminSetupPin}
                    onChange={(e) => setAdminSetupPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="管理者から共有されたPIN"
                    className="w-full px-3 py-2.5 pr-16 border border-amber-200 bg-amber-50/50 rounded-xl text-sm font-bold text-neutral-800 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminSetupPin((visible) => !visible)}
                    aria-label={showAdminSetupPin ? '管理者作成PINを隠す' : '管理者作成PINを表示'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-bold text-neutral-500 hover:text-neutral-900"
                  >
                    {showAdminSetupPin ? '隠す' : '表示'}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-neutral-500">管理者アカウントを作成する場合のみ必要です。</p>
              </div>
            )}

            {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

            <button
              id="login-create-submit-button"
              onClick={handleCreate}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition"
            >
              アカウントを作成してログイン
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
