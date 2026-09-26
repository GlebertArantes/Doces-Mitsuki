// Teste unitário standalone (Node.js, sem rede e sem depender do runtime
// Deno) para a lógica de looksLikeIp/extractClientIp de index.ts. Como o
// Deno (usado pela Edge Function) não está disponível neste ambiente, a
// lógica foi copiada aqui manualmente — se mudar em index.ts, replique a
// mudança aqui também. Rodar com: node ip-extraction.test.mjs

function looksLikeIp(value) {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  return ipv4.test(value) || (value.includes(':') && ipv6.test(value));
}

function extractClientIp(xffHeaderValue) {
  const xff = xffHeaderValue;
  if (!xff) return null;
  const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const candidate = parts[parts.length - 1];
  return looksLikeIp(candidate) ? candidate : null;
}

const cases = [
  {
    name: 'Sem cadeia de proxy (só o cliente falou direto) — cliente manda IP falso sozinho',
    header: '9.9.9.9',
    // Sem um proxy confiável no meio, não há como distinguir isso de um IP
    // real — é a limitação documentada no código (defesa em profundidade,
    // não fronteira absoluta). O teste confirma que o valor é aceito (é
    // sintaticamente um IP), mas isso por si só não é uma falha nova: o
    // limite por usuário continua sendo a defesa principal, independente disso.
    expected: '9.9.9.9',
  },
  {
    name: 'Cliente tenta se passar por outro IP prependando um valor falso à cadeia',
    header: '203.0.113.99, 10.0.0.5',
    // Presumindo que "10.0.0.5" foi anexado pelo hop confiável (o gateway da
    // Supabase) e "203.0.113.99" foi o que o cliente mandou de propósito: a
    // função deve usar o ÚLTIMO valor (o do hop confiável), não o primeiro
    // (o que o cliente pode forjar livremente).
    expected: '10.0.0.5',
  },
  {
    name: 'Cliente manda uma cadeia longa de IPs falsos para tentar poluir o histórico',
    header: '1.1.1.1, 2.2.2.2, 3.3.3.3, 198.51.100.7',
    expected: '198.51.100.7',
  },
  {
    name: 'Cabeçalho ausente',
    header: null,
    expected: null,
  },
  {
    name: 'Cabeçalho com lixo não parseável como IP (tentativa de quebrar a contagem)',
    header: 'nao-e-um-ip-de-verdade',
    expected: null,
  },
  {
    name: 'Cabeçalho com injeção de vírgulas vazias',
    header: '  , , 8.8.8.8 ,  ',
    expected: '8.8.8.8',
  },
  {
    name: 'IPv6 válido como último elemento',
    header: '203.0.113.5, 2001:db8::1',
    expected: '2001:db8::1',
  },
];

let pass = 0;
for (const c of cases) {
  const got = extractClientIp(c.header);
  const ok = got === c.expected;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${c.name}\n   header=${JSON.stringify(c.header)} esperado=${JSON.stringify(c.expected)} obtido=${JSON.stringify(got)}`);
  if (ok) pass++;
}
console.log(`\n${pass}/${cases.length} casos passaram`);
process.exit(pass === cases.length ? 0 : 1);
