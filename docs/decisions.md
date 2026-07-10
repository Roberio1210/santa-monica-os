# Decisões — Santa Monica OS

| Data | Decisão | Motivo |
| --- | --- | --- |
| 2026-07-09 | Hospedagem na Vercel, repositório no GitHub (`Roberio1210/santa-monica-os`) | Planos gratuitos, integração nativa com Next.js |
| 2026-07-09 | Next.js (App Router) + TypeScript | Padrão moderno, performático, compatível com Vercel |
| 2026-07-09 | Modo somente leitura para todas as integrações reais nesta fase | Reduzir risco operacional até validação com o proprietário |
| 2026-07-09 | JumpPark como fonte oficial de dados operacionais | Já existe integração validada (script Python de referência) |
| 2026-07-09 | Reaproveitar endpoints e padrão de autenticação já validados no script `jumppark_api.py` | Evitar quebrar uma integração que já funciona; reduzir risco de endpoint incorreto |
| 2026-07-09 | Agentes especializados documentados, sem modelo de IA pago conectado | Manter custo operacional zero nesta fase |
| 2026-07-09 | Banco de dados adiado (camada de repositório preparada para Supabase/PostgreSQL) | Evitar custo e complexidade prematura; dados demonstrativos suficientes para Sprint 1 |
| 2026-07-09 | Componentes de UI escritos manualmente no padrão shadcn (sem CLI) | Evitar dependência de rede/interatividade da CLI em execução autônoma |
| 2026-07-09 | Uso prioritário de ferramentas e planos gratuitos | Requisito explícito do projeto nesta fase |
| 2026-07-09 | Segurança das câmeras (RTSP/ONVIF) tratada como fase futura, sem exposição na internet | Risco de segurança de rede; depende de ponte local |
