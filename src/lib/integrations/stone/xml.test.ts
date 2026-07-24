import { describe, expect, it } from "vitest";
import { parseConciliationXml } from "@/lib/integrations/stone/xml";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Conciliation>
  <Header>
    <GenerationDateTime>20260721053000</GenerationDateTime>
    <StoneCode>123456789</StoneCode>
    <LayoutVersion>2.4</LayoutVersion>
    <FileId>1</FileId>
    <ReferenceDate>20260720</ReferenceDate>
  </Header>
  <FinancialTransactions>
    <Transaction>
      <Events>
        <CancellationCharges>0</CancellationCharges>
        <Cancellation>1</Cancellation>
        <Captures>1</Captures>
        <ChargebackRefunds>0</ChargebackRefunds>
        <Chargebacks>0</Chargebacks>
        <Payments>1</Payments>
      </Events>
      <AcquirerTransactionKey>NSU123</AcquirerTransactionKey>
      <InitiatorTransactionKey>INIT456</InitiatorTransactionKey>
      <AuthorizationDateTime>20260720120000</AuthorizationDateTime>
      <CaptureLocalDateTime>20260720120005</CaptureLocalDateTime>
      <International>false</International>
      <AccountType>2</AccountType>
      <InstallmentType>1</InstallmentType>
      <NumberOfInstallments>1</NumberOfInstallments>
      <AuthorizedAmount>150.00</AuthorizedAmount>
      <CapturedAmount>150.00</CapturedAmount>
      <CanceledAmount>0</CanceledAmount>
      <AuthorizationCurrencyCode>986</AuthorizationCurrencyCode>
      <IssuerAuthorizationCode>ABC123</IssuerAuthorizationCode>
      <BrandId>1</BrandId>
      <CardNumber>411111******1111</CardNumber>
      <Poi>
        <PoiType>1</PoiType>
        <SerialNumber>SN001</SerialNumber>
      </Poi>
      <EntryMode>1</EntryMode>
      <Cancellations>
        <Cancellation>
          <PaymentId>P1</PaymentId>
          <OperationKey>OP1</OperationKey>
          <CancellationDateTime>20260721100000</CancellationDateTime>
          <ReturnedAmount>50.00</ReturnedAmount>
        </Cancellation>
      </Cancellations>
      <Installments>
        <Installment>
          <InstallmentNumber>1</InstallmentNumber>
          <GrossAmount>150.00</GrossAmount>
          <NetAmount>145.50</NetAmount>
          <PrevisionPaymentDate>20260722</PrevisionPaymentDate>
          <MdrAmount>4.50</MdrAmount>
        </Installment>
      </Installments>
    </Transaction>
  </FinancialTransactions>
  <FinancialEvents>
    <Event>
      <EventId>EVT1</EventId>
      <Description>Liquidação</Description>
      <Type>10</Type>
      <PrevisionPaymentDate>20260722</PrevisionPaymentDate>
      <Amount>145.50</Amount>
    </Event>
  </FinancialEvents>
  <Payments>
    <Payment>
      <Id>PAY1</Id>
      <WalletTypeId>3</WalletTypeId>
      <TotalAmount>145.50</TotalAmount>
      <FavoredBankAccount>
        <BankCode>0341</BankCode>
        <BankBranch>1234</BankBranch>
        <BankAccountNumber>567890</BankAccountNumber>
      </FavoredBankAccount>
    </Payment>
  </Payments>
  <WalletPosition>
    <Wallets>
      <Wallet>
        <WalletTypeId>3</WalletTypeId>
        <WalletNatureId>1</WalletNatureId>
        <Category>Default</Category>
        <Amount>1000.00</Amount>
      </Wallet>
    </Wallets>
  </WalletPosition>
  <Trailer>
    <CapturedTransactionsQuantity>1</CapturedTransactionsQuantity>
    <CanceledTransactionsQuantity>1</CanceledTransactionsQuantity>
    <PaidInstallmentsQuantity>1</PaidInstallmentsQuantity>
    <ChargedCancellationsQuantity>0</ChargedCancellationsQuantity>
    <ChargebacksQuantity>0</ChargebacksQuantity>
    <ChargebacksRefundQuantity>0</ChargebacksRefundQuantity>
    <ChargedChargebacksQuantity>0</ChargedChargebacksQuantity>
    <PaidChargebacksRefundQuantity>0</PaidChargebacksRefundQuantity>
    <PaidEventsQuantity>1</PaidEventsQuantity>
    <ChargedEventsQuantity>0</ChargedEventsQuantity>
  </Trailer>
</Conciliation>`;

describe("parseConciliationXml — Sprint 7.0, Z1, baseado exclusivamente na doc oficial Stone", () => {
  it("mapeia Header corretamente", () => {
    const file = parseConciliationXml(SAMPLE_XML, "XML2_4");
    expect(file.header).toEqual({ generationDateTime: "20260721053000", stoneCode: "123456789", layoutVersion: "2.4", fileId: "1", referenceDate: "20260720" });
    expect(file.layout).toBe("XML2_4");
  });

  it("mapeia uma Transaction completa, com cancelamento e parcela", () => {
    const file = parseConciliationXml(SAMPLE_XML, "XML2_4");
    expect(file.financialTransactions).toHaveLength(1);
    const tx = file.financialTransactions[0];
    expect(tx.acquirerTransactionKey).toBe("NSU123");
    expect(tx.capturedAmount).toBe(150);
    expect(tx.international).toBe(false);
    expect(tx.brandId).toBe(1);
    expect(tx.poi).toEqual({ poiType: 1, serialNumber: "SN001" });
    expect(tx.cancellations).toHaveLength(1);
    expect(tx.cancellations[0]).toMatchObject({ paymentId: "P1", operationKey: "OP1", returnedAmount: 50 });
    expect(tx.installments).toHaveLength(1);
    expect(tx.installments[0]).toMatchObject({ installmentNumber: 1, grossAmount: 150, netAmount: 145.5, mdrAmount: 4.5, saleFee: null });
  });

  it("mapeia FinancialEvents.Event", () => {
    const file = parseConciliationXml(SAMPLE_XML, "XML2_4");
    expect(file.financialEvents).toEqual([{ eventId: "EVT1", description: "Liquidação", type: 10, previsionPaymentDate: "20260722", amount: 145.5, linkedMerchant: null }]);
  });

  it("mapeia Payments.Payment com FavoredBankAccount", () => {
    const file = parseConciliationXml(SAMPLE_XML, "XML2_4");
    expect(file.payments).toHaveLength(1);
    expect(file.payments[0].favoredBankAccount).toEqual({ bankCode: "0341", bankBranch: "1234", bankAccountNumber: "567890" });
  });

  it("mapeia WalletPosition.Wallets.Wallet — nunca chamado de saldo em tempo real neste nível (a honestidade é responsabilidade de service.ts)", () => {
    const file = parseConciliationXml(SAMPLE_XML, "XML2_4");
    expect(file.walletPositions).toEqual([{ walletTypeId: 3, walletNatureId: 1, category: "Default", amount: 1000 }]);
  });

  it("mapeia Trailer", () => {
    const file = parseConciliationXml(SAMPLE_XML, "XML2_4");
    expect(file.trailer.capturedTransactionsQuantity).toBe(1);
    expect(file.trailer.paidEventsQuantity).toBe(1);
  });

  it("containers ausentes (Layout 2.2 sem WalletPosition, sem FinancialTransactionsAccounts) viram listas vazias, nunca lançam", () => {
    const minimal = `<Conciliation><Header><GenerationDateTime>20260721053000</GenerationDateTime><StoneCode>1</StoneCode><LayoutVersion>2.2</LayoutVersion><FileId>1</FileId><ReferenceDate>20260720</ReferenceDate></Header><Trailer><CapturedTransactionsQuantity>0</CapturedTransactionsQuantity><CanceledTransactionsQuantity>0</CanceledTransactionsQuantity><PaidInstallmentsQuantity>0</PaidInstallmentsQuantity><ChargedCancellationsQuantity>0</ChargedCancellationsQuantity><ChargebacksQuantity>0</ChargebacksQuantity><ChargebacksRefundQuantity>0</ChargebacksRefundQuantity><ChargedChargebacksQuantity>0</ChargedChargebacksQuantity><PaidChargebacksRefundQuantity>0</PaidChargebacksRefundQuantity><PaidEventsQuantity>0</PaidEventsQuantity><ChargedEventsQuantity>0</ChargedEventsQuantity></Trailer></Conciliation>`;
    const file = parseConciliationXml(minimal, "XML2_2");
    expect(file.financialTransactions).toEqual([]);
    expect(file.financialEvents).toEqual([]);
    expect(file.financialTransactionsAccounts).toEqual([]);
    expect(file.financialEventsAccounts).toEqual([]);
    expect(file.payments).toEqual([]);
    expect(file.walletPositions).toEqual([]);
  });

  it("um único item repetível (ex.: uma só Transaction) nunca colapsa para objeto solto — sempre array", () => {
    const file = parseConciliationXml(SAMPLE_XML, "XML2_4");
    expect(Array.isArray(file.financialTransactions)).toBe(true);
    expect(Array.isArray(file.payments)).toBe(true);
    expect(Array.isArray(file.walletPositions)).toBe(true);
  });
});
