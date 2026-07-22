import { useState, type FormEvent } from 'react';

interface LoginProps {
  onSubmit: (token: string) => void;
  error?: string;
}

export function Login({ onSubmit, error }: LoginProps) {
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) {
      setMsg('Informe o token.');
      return;
    }
    setMsg('');
    onSubmit(t);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit} autoComplete="off">
        <div className="brand">
          <span className="dot" /> maps-to-lead
        </div>
        <h1>Área do manager</h1>
        <p>
          Acesso por token. Cole o <b>MANAGER_TOKEN</b> configurado no servidor.
        </p>
        <label htmlFor="token">Token de acesso</label>
        <input
          id="token"
          type="password"
          placeholder="••••••••••••••••"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          autoFocus
        />
        <button className="btn" type="submit">
          Entrar no painel
        </button>
        <div className="err">{msg || error || ''}</div>
      </form>
    </div>
  );
}
