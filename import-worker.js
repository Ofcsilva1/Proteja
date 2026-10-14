/* Spreadsheet parsing stays in a disposable worker. No macros/formulas execute. */
importScripts('./vendor/xlsx-0.20.3.full.min.js');
self.onmessage = ({ data: buffer }) => {
  try {
    const book = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: true, sheetRows: 5002, bookVBA: false, cellHTML: false });
    const names = ['Casos', 'Histórico', 'Sem prontuário'];
    const sheets = names.filter(name => book.SheetNames.includes(name)).map(name => {
      const sheet = book.Sheets[name];
      const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
      if (range.e.r > 5000 || range.e.c > 99) throw new Error('Aba excede o limite de 5.000 linhas ou 100 colunas. Divida o arquivo mantendo os cabeçalhos.');
      const cellText = (r, c) => {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell) return '';
        if (cell.t === 'e' || (cell.f && cell.v === undefined)) return '#ERRO_PLANILHA';
        if (cell.t === 'n' && XLSX.SSF.is_date(cell.z || '')) {
          const d = XLSX.SSF.parse_date_code(cell.v, { date1904: Boolean(book.Workbook?.WBProps?.date1904) });
          return d ? `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : '';
        }
        return String(cell.w ?? cell.v ?? '').trim();
      };
      let header = -1;
      for (let r = 0; r <= Math.min(range.e.r, 20); r++) {
        if (cellText(r, 0).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'prontuario') { header = r; break; }
      }
      if (header < 0) throw new Error(`Cabeçalho Prontuário não encontrado na aba ${name}.`);
      const headers = Array.from({ length: range.e.c + 1 }, (_, c) => cellText(header, c));
      if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error(`Cabeçalhos repetidos na aba ${name}.`);
      const rows = [];
      for (let r = header + 1; r <= range.e.r; r++) {
        const values = Object.fromEntries(headers.flatMap((h, c) => h ? [[h, cellText(r, c)]] : []));
        if (!Object.values(values).some(Boolean)) continue;
        const errors = Object.values(values).includes('#ERRO_PLANILHA') ? ['A linha contém erro de fórmula ou fórmula sem resultado salvo. Corrija no Excel e salve novamente.'] : [];
        rows.push({ row: r + 1, values, errors });
      }
      return { name, headers, rows };
    });
    self.postMessage({ sheets });
  } catch (error) { self.postMessage({ error: error.message || 'Não foi possível ler a planilha.' }); }
};
