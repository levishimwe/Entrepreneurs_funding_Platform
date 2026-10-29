import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

// Lets the console top bar host the search box of the page on screen. A page's
// SearchInput registers here; the top bar shows it on wide screens and hides
// itself on pages without a search. Outside the console nothing changes.
const Ctx = createContext(null);

export function ShellSearchProvider({ children }) {
  const [owner, setOwner] = useState(null);
  const [version, setVersion] = useState(0);
  const api = useMemo(
    () => ({
      register: (id, ref) => setOwner({ id, ref }),
      unregister: (id) => setOwner((o) => (o?.id === id ? null : o)),
      refresh: () => setVersion((v) => v + 1),
    }),
    []
  );
  // version changes with the page's query, so the top bar box re-renders.
  const value = useMemo(() => ({ ...api, owner, version }), [api, owner, version]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Called by SearchInput; returns true when the top bar hosts the search.
export function useHostedSearch(props) {
  const ctx = useContext(Ctx);
  const id = useId();
  const ref = useRef(props);
  ref.current = props;
  const register = ctx?.register;
  const unregister = ctx?.unregister;
  useEffect(() => {
    if (!register) return undefined;
    register(id, ref);
    return () => unregister(id);
  }, [register, unregister, id]);
  const refresh = ctx?.refresh;
  useEffect(() => {
    refresh?.();
  }, [refresh, props.value, props.placeholder]);
  return Boolean(ctx);
}

export function ShellSearchBox() {
  const ctx = useContext(Ctx);
  const props = ctx?.owner?.ref.current;
  const submit = useCallback(
    (e) => {
      e.preventDefault();
      props?.onSubmit?.();
    },
    [props]
  );
  if (!props) return null;
  return (
    <form role="search" className="relative hidden w-full max-w-md lg:block" onSubmit={submit}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--adm-muted)]" strokeWidth={1.5} aria-hidden="true" />
      <input
        className="adm-input !pl-9"
        type="search"
        aria-label={props.placeholder}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </form>
  );
}
