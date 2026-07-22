import { n } from '../format';

interface PagerProps {
  total: number;
  page: number; // 0-based
  pageSize: number;
  unit: string;
  onPage: (page: number) => void;
}

export function Pager({ total, page, pageSize, unit, onPage }: PagerProps) {
  if (total <= pageSize) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pages - 1);
  return (
    <div className="pager">
      <span>
        {n(total)} {unit} · página {cur + 1} de {pages}
      </span>
      <button type="button" disabled={cur <= 0} onClick={() => onPage(cur - 1)}>
        ‹ anterior
      </button>
      <button type="button" disabled={cur + 1 >= pages} onClick={() => onPage(cur + 1)}>
        próxima ›
      </button>
    </div>
  );
}
