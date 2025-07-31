import { TonClient, Address, fromNano, Cell } from "ton";
import { getHttpEndpoint } from "@orbs-network/ton-access";

// Адрес вашего кошелька, куда будут приходить платежи
const MY_WALLET_ADDRESS = "UQA6qcGAwqhOxgX81n-P_RVAIMOkeYoaoDWtAtyWAvOZtuuA"; // <-- Убедитесь, что это ваш адрес

// Создаем клиент для подключения к сети TON
let tonClient: TonClient;

const getClient = async () => {
  if (!tonClient) {
    // Используем прямой endpoint вместо @orbs-network/ton-access
    const endpoint = "https://testnet.toncenter.com/api/v2/jsonRPC";
    tonClient = new TonClient({ endpoint });
  }
  return tonClient;
};

/**
 * Пытается извлечь текстовый комментарий из тела транзакции.
 * @param body - Cell объект из inMessage.body
 * @returns - Текстовый комментарий или пустая строка.
 */
function extractMemo(body: Cell): string {
  try {
    const slice = body.beginParse();
    // Пропускаем первые 32 бита, которые часто являются op-кодом
    if (slice.remainingBits >= 32) {
      slice.loadUint(32);
    }
    // Читаем оставшуюся часть как текст
    return slice.loadStringTail();
  } catch (e) {
    // Если тело не содержит текстового комментария, вернется ошибка, которую мы игнорируем
    return '';
  }
}

/**
 * Находит транзакцию в блокчейне TON.
 * @param amountTON - Ожидаемая сумма в TON.
 * @param memo - Ожидаемый комментарий.
 * @returns - true, если транзакция найдена, иначе false.
 */
export const findTransaction = async (amountTON: number, memo: string): Promise<boolean> => {
  // Тестовый режим: принимаем все покупки без проверки блокчейна
  console.log(`💰 Тестовая покупка: ${amountTON} TON, мемо: "${memo}"`);
  console.log('✅ Покупка принята (тестовый режим)');
  return true;
  
  /*
  try {
    const client = await getClient();
    const myAddress = Address.parse(MY_WALLET_ADDRESS);

    console.log(`Ищем транзакцию: ${amountTON} TON с мемо "${memo}"`);
    const transactions = await client.getTransactions(myAddress, { limit: 10 });

  for (const tx of transactions) {
    const inMsg = tx.inMessage;
    if (!inMsg || inMsg.info.type !== 'internal') {
      continue;
    }

    const value = parseFloat(fromNano(inMsg.info.value.coins));
    const receivedMemo = extractMemo(inMsg.body);

    console.log(`Проверка транзакции: Сумма=${value} TON, Комментарий="${receivedMemo}"`);

    if (Math.abs(value - amountTON) < 0.001 && receivedMemo === memo) {
      console.log('✅ Транзакция найдена и подтверждена!');
      return true; // Сразу возвращаем true, как только нашли
    }
  }

  console.log('❌ Транзакция с нужными параметрами не найдена.');
  return false;
  
  } catch (error) {
    console.error('Ошибка при получении транзакций:', error);
    return false;
  }
  */
};
