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
  const { id, username, photoUrl } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  try {
    await findOrCreateUser(id, username, photoUrl);
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
    
    console.log(`💰 Ставка размещена: пользователь ${userId}, подарок ${userGiftId}, раунд ${currentRound.id}`);

    res.status(200).json({ message: 'Bet placed successfully in round ' + currentRound.id });
  } catch (error) {
    console.error('❌ Error placing bet:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Проверяем специфичные ошибки
    if (error instanceof Error && error.message.includes('unique constraint')) {
      res.status(400).json({ error: 'Этот подарок уже поставлен в текущем раунде' });
    } else {
      res.status(500).json({ 
        error: 'Internal server error or gift already bet',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// 6. Получение состояния текущего раунда
app.get('/api/roulette/state', async (req: Request, res: Response) => {
    try {
        console.log('🔍 API /api/roulette/state вызван');
        const state = await getRouletteState();
        console.log('🔍 State from getRouletteState BEFORE countdown check:', {
            roundId: state.roundId,
            status: state.status,
            playersCount: state.players.length,
            players: state.players.map(p => ({ 
                userId: p.userId, 
                username: p.username, 
                totalBet: p.totalBet, 
                percentage: p.percentage,
                color: p.color 
            }))
        });
        
        // Проверяем, можно ли начать раунд
        if (state.status === 'waiting' && state.players.length >= 2) {
            console.log('🕒 Автоматически запускаем countdown - игроков >= 2');
            console.log(`🔍 Переводим раунд ${state.roundId} в статус countdown`);
            await startRound(state.roundId);
            state.status = 'countdown';
            state.startedAt = new Date().toISOString(); // Обновляем время старта
        }


        // Если раунд в countdown, вычисляем оставшееся время
        let timeLeft = 0;
        if (state.status === 'countdown' && state.startedAt) {
            const elapsed = Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000);
            timeLeft = Math.max(0, 10 - elapsed); // Изменили с 25 на 10 секунд
            
            console.log(`⏰ Countdown: осталось ${timeLeft} секунд из 10`);
            
            // Автоматически переводим в spinning если время истекло
            if (timeLeft === 0) {
                console.log('⚡ Время вышло! Переводим раунд в статус spinning');
                await pool.query('UPDATE roulette_rounds SET status = $1 WHERE id = $2', ['spinning', state.roundId]);
                state.status = 'spinning';
            }
        }

        const responseData = {
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
        };
        
        console.log('🔍 FINAL state отправляем на frontend:', JSON.stringify({
            status: responseData.status,
            playersCount: responseData.players.length,
            players: responseData.players.map(p => ({ 
                userId: p.userId, 
                username: p.username, 
                totalBet: p.totalBet, 
                percentage: p.percentage,
                color: p.color 
            })),
            timeLeft: responseData.timeLeft,
            isActive: responseData.isActive
        }, null, 2));
        
        res.status(200).json(responseData);

    } catch (error) {
        console.error('❌ Error getting roulette state:', error);
        console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        res.status(500).json({ 
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// 7. Запустить рулетку (для тестирования)
app.post('/api/roulette/spin', async (req: Request, res: Response) => {
    try {
        const state = await getRouletteState();
        
        if (state.players.length < 2) {
            return res.status(400).json({ error: 'Недостаточно игроков для запуска' });
        }
        
        // Генерируем случайное число от 0 до 100 и seed для анимации
        const randomNumber = Math.random() * 100;
        const spinSeed = Math.floor(Math.random() * 360); // Seed для синхронизации анимации
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
        
        // Получаем все подарки из раунда для отображения выигрыша
        const allGifts = await getBetsForRound(state.roundId);
        const wonGifts = allGifts.map(bet => ({
            name: bet.gift_name,
            price_ton: bet.price_ton
        }));
        
        const totalWinValue = wonGifts.reduce((sum, gift) => sum + parseFloat(gift.price_ton), 0);
        
        // Завершаем раунд
        await finishRound(state.roundId, winner.userId);
        
        console.log(`🎉 Победитель: ${winner.username} (шанс: ${winner.percentage.toFixed(1)}%, число: ${randomNumber.toFixed(2)})`);
        console.log(`🎁 Выиграл ${wonGifts.length} подарков на сумму ${totalWinValue.toFixed(2)} TON`);
        
        res.status(200).json({
            winner: {
                ...winner,
                wonGifts,
                totalWinValue: totalWinValue.toFixed(2)
            },
            randomNumber: randomNumber.toFixed(2),
            spinSeed, // Добавляем seed для синхронизации анимации
            spinResult: `Победил ${winner.username}! Выиграл ${wonGifts.length} подарков на ${totalWinValue.toFixed(2)} TON`
        });
        
    } catch (error) {
        console.error('Error spinning roulette:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 8. Очистить раунд (для тестирования)  
app.post('/api/roulette/reset', async (req: Request, res: Response) => {
    try {
        console.log('🔄 Сброс раунда - начинаем очистку');
        
        // Получаем текущий раунд
        const currentRound = await getCurrentRound();
        
        // Удаляем все ставки
        await pool.query('DELETE FROM roulette_bets WHERE round_id = $1', [currentRound.id]);
        
        // Сбрасываем флаги is_bet для всех подарков
        await pool.query('UPDATE user_gifts SET is_bet = FALSE');
        
        // Переводим раунд в статус waiting
        await pool.query('UPDATE roulette_rounds SET status = $1, started_at = NULL, finished_at = NULL, winner_id = NULL WHERE id = $2', ['waiting', currentRound.id]);
        
        console.log(`🔄 Раунд ${currentRound.id} успешно очищен`);
        res.status(200).json({ message: 'Раунд успешно очищен' });
        
    } catch (error) {
        console.error('❌ Ошибка при сбросе раунда:', error);
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
