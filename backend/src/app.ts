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
  placeBet,
  getBetsForRound,
  getRouletteState,
  startRound,
  finishRound,
  canStartRound,
  canAddPlayer,
  getBetsForRound
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

// 3. Покупка подарка (ТЕСТОВЫЙ РЕЖИМ - без проверки TON транзакций)
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

      // ТЕСТОВЫЙ РЕЖИМ: выдаем подарок без проверки TON транзакции
      console.log(`🎁 ТЕСТОВАЯ ПОКУПКА: пользователь ${userId} получает подарок ${gift.name} (${gift.price_ton} TON)`);
      
      await grantGiftToUser(userId, giftId);
      res.status(200).json({ 
        message: `🎁 Тестовая покупка успешна! Подарок "${gift.name}" добавлен в инвентарь пользователя ${userId}`,
        testMode: true
      });

      // Для продакшена раскомментировать:
      // const giftPrice = parseFloat(gift.price_ton);
      // const transactionFound = await findTransaction(giftPrice, transactionMemo);
      // if (transactionFound) {
      //   await grantGiftToUser(userId, giftId);
      //   res.status(200).json({ message: `Purchase successful! Gift ${giftId} granted to user ${userId}` });
      // } else {
      //   res.status(400).json({ error: 'Transaction not found or invalid' });
      // }

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

// 6. Получение состояния текущего раунда
app.get('/api/roulette/state', async (req: Request, res: Response) => {
    try {
        const state = await getRouletteState();
        
        // Проверяем, можно ли начать раунд
        if (state.status === 'waiting' && state.players.length >= 2) {
            await startRound(state.roundId);
            state.status = 'countdown';
        }


        // Если раунд в countdown, вычисляем оставшееся время
        let timeLeft = 0;
        if (state.status === 'countdown' && state.startedAt) {
            const elapsed = Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000);
            timeLeft = Math.max(0, 25 - elapsed);
            
            console.log(`⏰ Countdown: осталось ${timeLeft} секунд из 25`);
        }

        res.status(200).json({
            ...state,
            isActive: state.status === 'countdown',
            timeLeft: timeLeft,
            isSpinning: state.status === 'spinning',
            // Добавляем детали для отладки
            debug: {
                roundId: state.roundId,
                status: state.status,
                playersCount: state.players.length,
                startedAt: state.startedAt
            }
        });

    } catch (error) {
        console.error('Error getting roulette state:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 7. Запустить рулетку (для тестирования)
app.post('/api/roulette/spin', async (req: Request, res: Response) => {
    try {
        const state = await getRouletteState();
        
        if (state.players.length < 2) {
            return res.status(400).json({ error: 'Недостаточно игроков для запуска' });
        }
        
        // Генерируем случайное число от 0 до 100
        const randomNumber = Math.random() * 100;
        let currentPercentage = 0;
        let winner = null;
        
        // Определяем победителя
        for (const player of state.players) {
            currentPercentage += player.percentage;
            if (randomNumber <= currentPercentage) {
                winner = player;
                break;
            }
        }
        
        if (!winner) {
            winner = state.players[state.players.length - 1]; // На всякий случай
        }
        
        // Завершаем раунд
        await finishRound(state.roundId, winner.userId);
        
        console.log(`🎉 Победитель: ${winner.username} (шанс: ${winner.percentage.toFixed(1)}%, число: ${randomNumber.toFixed(2)})`);
        
        res.status(200).json({
            winner,
            randomNumber: randomNumber.toFixed(2),
            spinResult: `Победил ${winner.username}!`
        });
        
    } catch (error) {
        console.error('Error spinning roulette:', error);
        res.status(500).json({ error: 'Internal server error' });
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
