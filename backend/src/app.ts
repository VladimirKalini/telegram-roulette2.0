import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { findTransaction } from './ton-service.js';
// Импортируем все нужные функции из database.js
import { 
  pool, 
  createUsersTable, 
  findOrCreateUser, 
  createGiftsTable, 
  createUserGiftsTable, 
  getAllGifts, 
  seedGifts, 
  grantGiftToUser, 
  getGiftById,
  getUserGifts,
  createRoundsTable,
  createBetsTable,
  getCurrentRound,
  placeBet
} from './database.js'; 

dotenv.config();

const app: Express = express();
const PORT: number = parseInt(process.env.PORT as string, 10) || 3000;

app.use(express.json());
app.use(cors());

// --- API Маршруты ---

// 1. Получение списка подарков из магазина
app.get('/api/store/gifts', async (req: Request, res: Response) => {
    try {
      const gifts = await getAllGifts();
      res.status(200).json(gifts);
    } catch (error) {
      console.error('Error fetching gifts:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Синхронизация (создание/поиск) пользователя
app.post('/api/users/sync', async (req: Request, res: Response) => {
  const { id, username } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  try {
    await findOrCreateUser(id, username);
    res.status(200).json({ message: 'User synced successfully' });
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Покупка подарка
app.post('/api/store/buy', async (req: Request, res: Response) => {
    const { userId, giftId, transactionMemo } = req.body;
  
    if (!userId || !giftId || !transactionMemo) {
      return res.status(400).json({ error: 'userId, giftId, and transactionMemo are required' });
    }
  
    try {
      const gift = await getGiftById(giftId);
      if (!gift) {
        return res.status(404).json({ error: 'Gift not found' });
      }
      const giftPrice = parseFloat(gift.price_ton);

      const transactionFound = await findTransaction(giftPrice, transactionMemo);
  
      if (transactionFound) {
        await grantGiftToUser(userId, giftId);
        res.status(200).json({ message: `Purchase successful! Gift ${giftId} granted to user ${userId}` });
      } else {
        res.status(400).json({ error: 'Transaction not found or invalid' });
      }
    } catch (error) {
      console.error('Error processing purchase:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
});

// 4. Получение инвентаря пользователя
app.get('/api/users/:userId/gifts', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const gifts = await getUserGifts(userId);
    res.status(200).json(gifts);
  } catch (error) {
    console.error('Error fetching user gifts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Сделать ставку в рулетке
app.post('/api/roulette/bet', async (req: Request, res: Response) => {
  const { userId, userGiftId } = req.body;

  if (!userId || !userGiftId) {
    return res.status(400).json({ error: 'userId and userGiftId are required' });
  }

  try {
    // TODO: Добавить проверку, что подарок действительно принадлежит этому пользователю
    
    // Находим текущий или создаем новый раунд
    const currentRound = await getCurrentRound();

    // Делаем ставку
    await placeBet(currentRound.id, userGiftId, userId);

    res.status(200).json({ message: 'Bet placed successfully in round ' + currentRound.id });
  } catch (error) {
    console.error('Error placing bet:', error);
    // Ошибка может возникнуть, если этот подарок уже был поставлен (UNIQUE constraint)
    res.status(500).json({ error: 'Internal server error or gift already bet' });
  }
});


// --- Запуск Сервера ---
const startServer = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ База данных успешно подключена!');
    
    // Создаем все таблицы
    await createUsersTable();
    await createGiftsTable();
    await createUserGiftsTable();
    await createRoundsTable();
    await createBetsTable();
    console.log('✅ Все таблицы успешно созданы или уже существуют.');

    // Наполняем магазин тестовыми товарами
    await seedGifts();
    console.log('✅ Таблица "gifts" наполнена тестовыми данными.');

    // Запускаем сервер
    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на порту: ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Не удалось запустить сервер:', error);
  }
};

startServer();
