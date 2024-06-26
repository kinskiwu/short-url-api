import app from './';
import 'dotenv/config';
import { connectDatabase } from './config/database';
import mongoose from 'mongoose';
import { connectRedis } from './config/redis';
import { logger } from './config/winston';

const PORT = process.env.PORT || 4000;
/**
 * Initialize and start the application server
 */
const startServer = async () => {
  try {
    await connectDatabase();

    const redisClient = await connectRedis();
    app.locals.redisClient = redisClient;

    const server = app.listen(PORT, () =>
      logger.info(`Listening on port ${PORT}`)
    );

    // handle server shutdown with SIGINT signal (e.g Ctrl+C)
    process.on('SIGINT', async () => {
      logger.info('SIGINT signal received: closing MongoDB connection');

      try {
        await mongoose.disconnect();
        logger.info('MongoDB connection closed.');
      } catch (err) {
        logger.error('Error closing MongoDB connection:', err);
      }

      try {
        await redisClient.quit();
        logger.info('Redis connection closed.');
      } catch (err) {
        logger.error('Error closing Redis connection:', err);
      }

      server.close(() => {
        logger.info('Server shut down successfully.');
        process.exit(0);
      });
    });
  } catch (err) {
    logger.error('Error starting server:', err);
    process.exit(1);
  }
};

// prevent server initialization during test runs to avoid jest conflicts
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    logger.error('Error starting server:', err);
    process.exit(1);
  });
}
