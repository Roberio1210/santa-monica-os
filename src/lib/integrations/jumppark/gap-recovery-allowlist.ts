/**
 * Lista FIXA das 46 ordens JumpPark ausentes no Neon (saídas de 21 a 25/09/2026 — lacuna de
 * sincronização de 21–30/09), validada na auditoria somente leitura
 * `auditoria-jumppark-2026-09-19_2026-10-01.json` (sha256 d2e07a48ba08c350e4863ba159eb060e26c9ca2f123f4343aea636eb0984dc2d,
 * gerada pela rota /api/admin/jumppark-auditoria em 10/10/2026 13:30).
 *
 * Guardamos o SHA-256 do `serviceOrderId` (= `jumppark_service_orders.external_id`), nunca o
 * identificador em claro: o identificador do JumpPark embute a placa do veículo, e placa não deve
 * ir para o repositório. A recuperação calcula o hash de cada ordem devolvida pela API e só
 * aceita as que estão aqui — nenhuma ordem fora desta lista é gravada.
 */
export const GAP_RECOVERY_ALLOWED_ID_HASHES: ReadonlySet<string> = new Set([
  "017691daa64d69ddb611ed7e33ecc4552912ecf9e5a0e10e9eaa59ff63fe3949",
  "087fa51c358a1999e4222cd4def89a5c3aee0a22380584364e135bb74f86183d",
  "1724d21b3f14d487a6719deccf651c0fbe466c72e8e9fe301552219f66542484",
  "192e56356562a330c9ca8f5867a539d02200a67926727a08744ebbcd4bdf0c09",
  "1d7274e07617be6128d1d2d09a18e8e2788065ca2f81619641f0cbc26eda8c75",
  "2449d9e9087f35cf83b5515de2c7f9c3f271fd8d08cec7bab3fc6b1919f52173",
  "293d2438f1d83e0a38071c15df69900d22edd3fbdc7b6179b0178dd31bc6fb78",
  "2c26c74988df914e8481be587477dea160dea68825d6899bd0ffb4a34e287a22",
  "2e84a4c48f4efaed3ee7e5c5299bcb75c5e6a04ab748a5267c8c6ebaba9d760c",
  "38e24500a2ae564be569aa9675dd65e264895e8da4e060b9a2d272244df57337",
  "3afa1658c9abaf920826d1fc328699f166b7aa240e5cf43ddd1fea5f54d2bfb0",
  "418ec69c41ef4381510f89d6488ced51e3b95a424cbdff69803ce6ea4b02623f",
  "4a142091dcedab01a0b7869f39ed3b28959fa9a5155bd4bb1196694a2a1bafc3",
  "5ef5226d790a3a0ac983af8edef70508844df538a365b816212814c931778952",
  "6dc707c3efbdc844c0962eef8a11bb3a6c2e9595570ea1483e0877153c975a7c",
  "77b45ebf2bb969b88bef406b134e311b4e979b169f706cc9a32b81fada7d5a89",
  "7ad21cd905dcb5606c4ca356f3f2c922c1e2adbae787bead9a257574b20cce33",
  "7c5647cca39254c1337c8f6a8b9d0f07d408dcf3cada705a1f08d56d648dd269",
  "7ee14bf2db09312f72c3d2e4b5dbe5bae507b4fc560a91fe00c1667ad918b2ef",
  "82c2c301fc779cebfa90039489ab4e4d6359befd30449bc2961630cf8b99543f",
  "8aba88c195f602772a189cdb87d23b17a96741e540165e8334c2851bf5493613",
  "8cf0e5994fc87164c565430dda5427f58851f09e8b76335c49ca6a0907c143bd",
  "8f0488997b64578e86530bd6c7a70a966cc8d662155fed1398e95d513b5425c6",
  "9217d023bbbac596128d2b29d39f2bc7278de33aa0c54ef5d4bf2050e39329e7",
  "a38483000b102b11b2f0994b6b3cb1978bdd99090b364260a13d913c7cf7e029",
  "b783499fcd661a00453f00c70669f4f25efdcfb18f08b7b9f9aaec4b54c58f05",
  "bba5b858b4a9a7ba60698a745c984f6cf5313f13709d012dd0f567fc20a05d33",
  "bda1279754ccbc6c5bd6afcd1bdcbfdea1437b3aa458f15424d236bc4893ee50",
  "c1a35a2ce6c7ec170dc45205cef1bda9775595538cfc092d22a758b452f12d3b",
  "c3e8f39f4001bf9bd7efc893632cbb087d717968753cb8f075cf8c278847db28",
  "c5f6fe9c5c60a69b5ecbd730036ec9300c6d3821c74d30717dbee21fdd358046",
  "c80c015e8c6b34c87f9b3ddb1b1e60c9f8da5e4bb7fb79799d21b75552abde16",
  "cdf9b17e3ac3621129dcda52da630b5b137de4eaf5b2de764eabeddefcb43cb0",
  "d221a86eb455a43f470574c4d8c38249db813f7efa21d5cce260c8b0a331f16e",
  "d46c27144fb1b6cbc67bbae97554d7f5faa167b510afd4c09d980ae8787b9cdb",
  "d9bea15a90ba22a27440d9799ce5ce0f4a6575c99570ef5644678c4ac5615062",
  "dc7dcc62bce0b664ef14503053593c1503618bf30b3cdab33a85418baae834ef",
  "ddbdeb9fd3822fc676b7bb7fa3a1f5b4bce65ae9d75e7c583b09f2244f3521f6",
  "e17f01165fe7d68044312d2a72046cbc1eee8398978e9f232049ff9137b6c08c",
  "e36eae3fabfb4515ab96316e54d691c991bc4bf841780626fedf951fd559c2af",
  "e608a6effd7652c260b1f7a57bb376bf3370eb9b65e72af7029b3e162b0f1590",
  "e84c9b4679854a2effaafd4ce8bd7ccf26697a87a401f2b2652340942794e04a",
  "f1f711fda76d1b30de1f0c11f2d7eb2cbdc4ec05fd0edafbaedfb10ea0a18d43",
  "f28a76b8eb3109eb02a8ba2df2823d93c4841fd25feda05d3640d8ea7ad2e9fe",
  "fc5a1069d84209679663f1e1413ac6de4e1401c130f449fd99e9ed471a803de2",
  "fd05e8457b14426f413f72dded96a720be8208708ff9d91975fff6f7202a851d",
]);

/** Totais esperados das 46 ordens (auditoria validada). Qualquer diferença bloqueia a gravação. */
export const GAP_RECOVERY_EXPECTED = {
  orders: 46,
  items: 24,
  parkingAmountCents: 118_200,
  servicesAmountCents: 706_000,
  totalAmountCents: 824_200,
  itemsAmountCents: 720_000,
  /** Ordens por dia de SAÍDA/pagamento. */
  ordersByExitDate: { "2026-09-21": 2, "2026-09-22": 4, "2026-09-23": 6, "2026-09-24": 13, "2026-09-25": 21 } as Readonly<Record<string, number>>,
} as const;

/** Janela consultada na API (por dia de saída) — exatamente os dias das 46 ordens. */
export const GAP_RECOVERY_WINDOW = { from: "2026-09-21", to: "2026-09-25" } as const;

/** Referência da auditoria que originou a lista (vai para o registro em audit_logs). */
export const GAP_RECOVERY_AUDIT_SHA256 = "d2e07a48ba08c350e4863ba159eb060e26c9ca2f123f4343aea636eb0984dc2d";
