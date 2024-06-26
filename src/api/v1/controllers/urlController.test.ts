import { Request, Response, NextFunction } from 'express';
import { urlService } from '../services';
import {
  createShortUrl,
  generateAnalytics,
  redirectToLongUrl,
} from './urlController';
import type { RedisClientType } from 'redis';

// Mock external modules
jest.mock('../services/urlService');
jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  }),
}));

describe.skip('URL Controller Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFunction: NextFunction;
  const mockRedisClient: Partial<RedisClientType> = {
    connect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      app: { locals: { redisClient: mockRedisClient } },
    } as unknown as Partial<Request>;
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
    } as Partial<Response>;
    nextFunction = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('createShortUrl Controller', () => {
    it('should successfully create and return a short URL', async () => {
      const mockLongUrl = 'http://cloudflare.com';
      const mockShortUrlId = 'cloudflare';
      (urlService.findOrCreateShortUrl as jest.Mock).mockResolvedValue(
        mockShortUrlId
      );
      mockReq.body = { longUrl: mockLongUrl };

      await createShortUrl(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(urlService.findOrCreateShortUrl).toHaveBeenCalledWith(mockLongUrl);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        shortUrl: `www.shorturl.com/${mockShortUrlId}`,
      });
    });

    it('should call next with an error when findOrCreateShortUrl service fails', async () => {
      const error = new Error('Service Error');
      mockReq.body = { longUrl: 'http://cloudflare.com' };
      (urlService.findOrCreateShortUrl as jest.Mock).mockRejectedValue(error);

      await createShortUrl(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(urlService.findOrCreateShortUrl).toHaveBeenCalledWith(
        'http://cloudflare.com'
      );
      expect(nextFunction).toHaveBeenCalledWith(error);
    });
  });

  describe('redirectToLongUrl Controller', () => {
    it('should redirect to long URL when short URL ID is valid', async () => {
      const mockShortUrlId = 'cloudflare';
      const mockLongUrl = 'http://cloudflare.com';
      mockReq.params = { shortUrlId: mockShortUrlId };
      (mockRedisClient.get as jest.Mock).mockResolvedValue(mockLongUrl);

      await redirectToLongUrl(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(301, mockLongUrl);
    });

    it('should handle when no cache or database entry exists', async () => {
      mockReq.params = { shortUrlId: 'nonexistent' };
      (mockRedisClient.get as jest.Mock).mockResolvedValue(null);
      (urlService.findShortUrl as jest.Mock).mockRejectedValue(
        new Error('Not found')
      );

      await redirectToLongUrl(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(urlService.findShortUrl).toHaveBeenCalledWith('nonexistent');
      expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should redirect to long URL from cache when cache is hit', async () => {
      const mockShortUrlId = 'cloudflare';
      const mockLongUrl = 'http://cloudflare.com';
      mockReq.params = { shortUrlId: mockShortUrlId };
      (mockRedisClient.get as jest.Mock).mockResolvedValue(mockLongUrl); // Cache hit

      await redirectToLongUrl(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(301, mockLongUrl);
    });

    it('should save to cache and redirect to long URL when cache is missed', async () => {
      const mockShortUrlId = 'cloudflare';
      const mockLongUrl = 'http://cloudflare.com';
      mockReq.params = { shortUrlId: mockShortUrlId };
      (mockRedisClient.get as jest.Mock).mockResolvedValue(null); // Cache miss
      (urlService.findShortUrl as jest.Mock).mockResolvedValue({
        longUrl: mockLongUrl,
      });

      await redirectToLongUrl(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `shortUrl:${mockShortUrlId}`,
        mockLongUrl,
        { EX: expect.any(Number) }
      );
      expect(mockRes.redirect).toHaveBeenCalledWith(301, mockLongUrl);
    });
  });

  describe('generateAnalytics Controller', () => {
    it('should return analytics data for a given short URL', async () => {
      const mockShortUrlId = 'cloudflare';
      const mockTimeFrame = '24h';
      const mockAccessCount = 5;
      mockReq.query = {
        shortUrlId: mockShortUrlId,
        timeFrame: mockTimeFrame,
      };
      (mockRedisClient.get as jest.Mock).mockResolvedValue(null);
      (urlService.getAccessCountForShortUrl as jest.Mock).mockResolvedValue(
        mockAccessCount
      );

      await generateAnalytics(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        timeFrame: mockTimeFrame,
        accessCount: mockAccessCount,
      });
    });

    it('should handle unsupported time frames by treating them as "all"', async () => {
      mockReq.query = {
        shortUrlId: 'validShortId',
        timeFrame: 'unsupported',
      };
      (mockRedisClient.get as jest.Mock).mockResolvedValue(null);
      (urlService.getAccessCountForShortUrl as jest.Mock).mockResolvedValue(10);

      await generateAnalytics(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(urlService.getAccessCountForShortUrl).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        timeFrame: 'all',
        accessCount: 10,
      });
    });

    it('should return a 404 error if the short URL is not found', async () => {
      mockReq.query = { shortUrlId: 'nonexistent', timeFrame: '24h' };
      (mockRedisClient.get as jest.Mock).mockResolvedValue(null);
      (urlService.findShortUrl as jest.Mock).mockRejectedValue(
        new Error('Not found')
      );

      await generateAnalytics(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(urlService.findShortUrl).toHaveBeenCalledWith('nonexistent');
      expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle when no analytics data is available', async () => {
      mockReq.query = { shortUrlId: 'validShortId', timeFrame: '24h' };
      (mockRedisClient.get as jest.Mock).mockResolvedValue(null);
      (urlService.getAccessCountForShortUrl as jest.Mock).mockResolvedValue(0);

      await generateAnalytics(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        timeFrame: '24h',
        accessCount: 0,
      });
    });

    it('should return analytics data from cache when cache is hit', async () => {
      const mockShortUrlId = 'cloudflare';
      const mockTimeFrame = '24h';
      const mockAccessCount = 5;
      mockReq.query = { shortUrlId: mockShortUrlId, timeFrame: mockTimeFrame };
      const cachedData = {
        timeFrame: mockTimeFrame,
        accessCount: mockAccessCount,
      };
      (mockRedisClient.get as jest.Mock).mockResolvedValue(
        JSON.stringify(cachedData)
      ); // Cache hit

      await generateAnalytics(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(cachedData);
    });

    it('should save analytics data to cache when cache is missed', async () => {
      const mockShortUrlId = 'cloudflare';
      const mockTimeFrame = '24h';
      const mockAccessCount = 5;
      mockReq.query = { shortUrlId: mockShortUrlId, timeFrame: mockTimeFrame };
      const cacheKey = `analytics:${mockShortUrlId}:${mockTimeFrame}`;
      (mockRedisClient.get as jest.Mock).mockResolvedValue(null); // Cache miss
      (urlService.getAccessCountForShortUrl as jest.Mock).mockResolvedValue(
        mockAccessCount
      );

      await generateAnalytics(
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        cacheKey,
        JSON.stringify({
          timeFrame: mockTimeFrame,
          accessCount: mockAccessCount,
        }),
        { EX: expect.any(Number) }
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        timeFrame: mockTimeFrame,
        accessCount: mockAccessCount,
      });
    });
  });
});
