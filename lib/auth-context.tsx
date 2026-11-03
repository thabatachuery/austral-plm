"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  updatePassword: (newPassword: string) => Promise<string | null>;
};

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  passwordRecovery: false,
  signIn: async () => null,
  signOut: async () => {},
  resetPassword: async () => null,
  updatePassword: async () => null,
});

// Permissões e nome vêm de app_metadata/user_metadata — se mudarem, a tela
// precisa do objeto novo; fora isso é a mesma sessão.
function mesmoUsuario(a: User | null, b: User | null) {
  if (!a || !b) return a === b;
  return a.id === b.id
    && a.email === b.email
    && JSON.stringify(a.app_metadata) === JSON.stringify(b.app_metadata)
    && JSON.stringify(a.user_metadata) === JSON.stringify(b.user_metadata);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    // Verificar sessão inicial
    getSupabase().auth.getUser().then(({ data: { user } }) => {
      const novo = user ?? null;
      setUser(prev => mesmoUsuario(prev, novo) ? prev : novo);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
    // Ouvir mudanças (login, logout, refresh de token)
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
      (event, session) => {
        // Ao voltar pra aba do navegador o Supabase revalida a sessão e emite
        // SIGNED_IN/TOKEN_REFRESHED com um objeto `user` novo, mesmo sendo a
        // mesma pessoa. Trocar a referência fazia a página achar que era um
        // login novo: recarregava tudo e a tela voltava do zero (filtros,
        // rolagem, o que estava aberto). Só troca se algo relevante mudou.
        const novo = session?.user ?? null;
        setUser(prev => mesmoUsuario(prev, novo) ? prev : novo);
        // Ao clicar no link de "esqueci minha senha", o Supabase autentica a sessão
        // automaticamente — travar aqui até a pessoa definir uma senha nova, em vez
        // de deixar o link logar direto no sistema sem trocar nada.
        if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
        if (event === "SIGNED_OUT") setPasswordRecovery(false);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  const signOut = async () => {
    await getSupabase().auth.signOut();
  };

  const resetPassword = async (email: string): Promise<string | null> => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    });
    return error ? error.message : null;
  };

  const updatePassword = async (newPassword: string): Promise<string | null> => {
    const { error } = await getSupabase().auth.updateUser({ password: newPassword });
    if (!error) setPasswordRecovery(false);
    return error ? error.message : null;
  };

  return (
    <AuthContext.Provider value={{ user, loading, passwordRecovery, signIn, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
