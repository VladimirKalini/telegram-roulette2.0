import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT as string, 10),
});

// --- Функции создания таблиц ---
const createUsersTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username VARCHAR(255),
      ton_address VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await pool.query(queryText);
};

const createGiftsTable = async () => {
    const queryText = `
      CREATE TABLE IF NOT EXISTS gifts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        price_ton NUMERIC(10, 2) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE
      );
    `;
    await pool.query(queryText);
  };

const createUserGiftsTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS user_gifts (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      gift_id INTEGER NOT NULL REFERENCES gifts(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await pool.query(queryText);
};

const createRoundsTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS roulette_rounds (
        id SERIAL PRIMARY KEY,
        status VARCHAR(50) NOT NULL DEFAULT 'waiting',
        winner_id BIGINT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ
    );
  `;
  await pool.query(queryText);
};

const createBetsTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS roulette_bets (
        id SERIAL PRIMARY KEY,
        round_id INTEGER NOT NULL REFERENCES roulette_rounds(id),
        user_gift_id INTEGER NOT NULL REFERENCES user_gifts(id) UNIQUE,
        user_id BIGINT NOT NULL REFERENCES users(id)
    );
  `;
  await pool.query(queryText);
};


// --- Функции для работы с данными ---
const findOrCreateUser = async (id: number, username?: string) => {
  const queryText = `
    INSERT INTO users (id, username)
    VALUES ($1, $2)
    ON CONFLICT (id) DO NOTHING;
  `;
  await pool.query(queryText, [id, username]);
};

const getAllGifts = async () => {
  const result = await pool.query('SELECT * FROM gifts WHERE is_active = TRUE ORDER BY price_ton ASC;');
  return result.rows;
};

const getGiftById = async (giftId: number) => {
    const result = await pool.query('SELECT * FROM gifts WHERE id = $1', [giftId]);
    return result.rows[0]; 
};

const grantGiftToUser = async (userId: number, giftId: number) => {
    const queryText = `
      INSERT INTO user_gifts (user_id, gift_id)
      VALUES ($1, $2);
    `;
    await pool.query(queryText, [userId, giftId]);
};

const getUserGifts = async (userId: number) => {
  const queryText = `
    -- Выбираем только те подарки, которые еще не были поставлены в рулетку
    SELECT ug.id as user_gift_id, g.id, g.name, g.description, g.price_ton FROM user_gifts ug
    JOIN gifts g ON ug.gift_id = g.id
    LEFT JOIN roulette_bets rb ON ug.id = rb.user_gift_id
    WHERE ug.user_id = $1 AND rb.id IS NULL;
  `;
  const result = await pool.query(queryText, [userId]);
  return result.rows;
};

const seedGifts = async () => {
  const giftsToSeed = [
    { name: 'Кофе-латте', description: 'Согревающий напиток', price_ton: 1.50 },
    { name: 'Праздничный коктейль', description: 'Для особого случая', price_ton: 5.00 },
    { name: 'Золотой билет', description: 'Редкий коллекционный предмет', price_ton: 25.00 }
  ];

  const client = await pool.connect();
  try {
    for (const gift of giftsToSeed) {
      await client.query(
        'INSERT INTO gifts (name, description, price_ton) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
        [gift.name, gift.description, gift.price_ton]
      );
    }
  } finally {
    client.release();
  }
};

const getCurrentRound = async () => {
  let result = await pool.query("SELECT * FROM roulette_rounds WHERE status = 'waiting' ORDER BY created_at DESC LIMIT 1");
  if (result.rows.length === 0) {
    result = await pool.query("INSERT INTO roulette_rounds (status) VALUES ('waiting') RETURNING *");
  }
  return result.rows[0];
};

const placeBet = async (roundId: number, userGiftId: number, userId: number) => {
  const queryText = `
    INSERT INTO roulette_bets (round_id, user_gift_id, user_id)
    VALUES ($1, $2, $3);
  `;
  await pool.query(queryText, [roundId, userGiftId, userId]);
};

const getBetsForRound = async (roundId: number) => {
    const queryText = `
        SELECT 
            rb.user_id,
            u.username,
            g.price_ton,
            g.name as gift_name,
            rb.user_gift_id
        FROM roulette_bets rb
        JOIN user_gifts ug ON rb.user_gift_id = ug.id
        JOIN gifts g ON ug.gift_id = g.id
        JOIN users u ON rb.user_id = u.id
        WHERE rb.round_id = $1;
    `;
    const result = await pool.query(queryText, [roundId]);
    return result.rows;
};

// Получить полное состояние рулетки
const getRouletteState = async () => {
    try {
        // Получаем текущий раунд
        const currentRound = await getCurrentRound();
        
        // Получаем все ставки для этого раунда
        const bets = await getBetsForRound(currentRound.id);
        
        // Группируем ставки по игрокам
        const playerMap = new Map();
        let totalValue = 0;
        
        bets.forEach(bet => {
            const userId = bet.user_id;
            const betValue = parseFloat(bet.price_ton);
            totalValue += betValue;
            
            if (!playerMap.has(userId)) {
                playerMap.set(userId, {
                    userId,
                    username: bet.username,
                    totalBet: 0,
                    gifts: [],
                    userGiftIds: []
                });
            }
            
            const player = playerMap.get(userId);
            player.totalBet += betValue;
            player.gifts.push({
                name: bet.gift_name,
                price_ton: bet.price_ton
            });
            player.userGiftIds.push(bet.user_gift_id);
        });
        
        // Преобразуем в массив и вычисляем проценты
        const players = Array.from(playerMap.values()).map((player, index) => ({
            ...player,
            percentage: totalValue > 0 ? (player.totalBet / totalValue) * 100 : 0,
            color: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][index % 5]
        }));
        
        return {
            roundId: currentRound.id,
            status: currentRound.status,
            players,
            totalValue,
            timeLeft: 0, // Будем вычислять отдельно
            maxPlayers: 5
        };
    } catch (error) {
        console.error('Ошибка получения состояния рулетки:', error);
        throw error;
    }
};

// Запустить раунд (начать отсчет)
const startRound = async (roundId: number) => {
    const queryText = `
        UPDATE roulette_rounds 
        SET status = 'countdown', started_at = NOW() 
        WHERE id = $1;
    `;
    await pool.query(queryText, [roundId]);
};

// Завершить раунд и определить победителя
const finishRound = async (roundId: number, winnerId: number) => {
    const queryText = `
        UPDATE roulette_rounds 
        SET status = 'finished', winner_id = $2, finished_at = NOW() 
        WHERE id = $1;
    `;
    await pool.query(queryText, [roundId, winnerId]);
    
    // Передаем все подарки победителю
    await transferAllGiftsToWinner(roundId, winnerId);
};

// Передать все подарки победителю
const transferAllGiftsToWinner = async (roundId: number, winnerId: number) => {
    // Получаем все ставки раунда
    const bets = await getBetsForRound(roundId);
    
    // Передаем каждый подарок победителю
    for (const bet of bets) {
        const queryText = `
            UPDATE user_gifts 
            SET user_id = $1, is_bet = FALSE 
            WHERE id = $2;
        `;
        await pool.query(queryText, [winnerId, bet.user_gift_id]);
    }
};

// Проверить, можно ли начать раунд
const canStartRound = async (roundId: number) => {
    const bets = await getBetsForRound(roundId);
    const uniquePlayers = new Set(bets.map(bet => bet.user_id));
    return uniquePlayers.size >= 2;
};

// Проверить, можно ли добавить игрока
const canAddPlayer = async (roundId: number) => {
    const bets = await getBetsForRound(roundId);
    const uniquePlayers = new Set(bets.map(bet => bet.user_id));
    return uniquePlayers.size < 5; // Максимум 5 игроков
};


// Экспортируем все наши функции
export { 
    pool, 
    createUsersTable, 
    findOrCreateUser, 
    createGiftsTable, 
    createUserGiftsTable, 
    getAllGifts, 
    seedGifts, 
    getGiftById, 
    grantGiftToUser,
    getUserGifts,
    createRoundsTable,
    createBetsTable,
    getCurrentRound,
    placeBet,
    getBetsForRound,
    getRouletteState,
    startRound,
    finishRound,
    transferAllGiftsToWinner,
    canStartRound,
    canAddPlayer
};
