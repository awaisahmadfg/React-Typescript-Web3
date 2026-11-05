/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable complexity */

const { Queue } = require('bullmq');
const Redis = require('ioredis');
const { childLogger } = require('./logger');

const QUEUE_IMAGE_GENERATE_NAME = 'QUEUE_IMAGE_GENERATE_NAME';
const QUEUE_DESCRIPTION_GENERATE = 'QUEUE_DESCRIPTION_GENERATE';
const QUEUE_TEASER_GENERATE_NAME = 'QUEUE_TEASER_GENERATE_NAME';
const QUEUE_PRIOR_ART_NAME = 'QUEUE_PRIOR_ART_NAME';
const QUEUE_REWARD_DISTRIBUTE = 'QUEUE_REWARD_DISTRIBUTE';
const QUEUE_3D_MODEL_GENERATE = 'QUEUE_3D_MODEL_GENERATE';
const QUEUE_VIDEO_GENERATION = 'QUEUE_VIDEO_GENERATION';
const QUEUE_PROMO_VIDEO_GENERATION = 'QUEUE_PROMO_VIDEO_GENERATION';
const QUEUE_TAG_FOLLOW_EMAIL = 'QUEUE_TAG_FOLLOW_EMAIL';
const QUEUE_MANUFACTURER_EMAIL = 'QUEUE_MANUFACTURER_EMAIL';
const SEND_NEW_EMPLOYEE_EMAIL = 'SEND_NEW_EMPLOYEE_EMAIL';
const GET_PDF_TEMPLATE = 'GET_PDF_TEMPLATE';
const GENERATE_ADS_DOCUMENT = 'GENERATE_ADS_DOCUMENT';
const PRE_EXPIRED_CONCEPTS_DELETION_EMAIL =
  'PRE_EXPIRED_CONCEPTS_DELETION_EMAIL';
const EXPIRED_CONCEPTS_DELETION_EMAIL = 'EXPIRED_CONCEPTS_DELETION_EMAIL';
const QUEUE_NFT_EMAILS = 'QUEUE_NFT_EMAILS';
const CREATE_COMPONENT = 'CREATE_COMPONENT';
const QUEUE_PATENT_TOKEN_LAUNCH = 'QUEUE_PATENT_TOKEN_LAUNCH';
const PROPOSE_NEW_COMPONENT = 'PROPOSE_NEW_COMPONENT';
const QUEUE_COMMUNITY_IMPORT = 'QUEUE_COMMUNITY_IMPORT';
const QUEUE_AGENT_MAIL = 'QUEUE_AGENT_MAIL';
const QUEUE_AGENT_MAIL_IMPORT = 'QUEUE_AGENT_MAIL_IMPORT';
const QUEUE_CATALOGUE_IMPORT = 'QUEUE_CATALOGUE_IMPORT';

const connection = new Redis({
  port: Number(process.env.REDIS_PORT),
  host: process.env.REDIS_URL,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

class QueueDb {
  constructor() {
    this.logger = childLogger('QueueDb');

    this.queues = {
      [QUEUE_IMAGE_GENERATE_NAME]: new Queue(QUEUE_IMAGE_GENERATE_NAME, {
        connection,
      }),
      [QUEUE_DESCRIPTION_GENERATE]: new Queue(QUEUE_DESCRIPTION_GENERATE, {
        connection,
      }),
      [QUEUE_REWARD_DISTRIBUTE]: new Queue(QUEUE_REWARD_DISTRIBUTE, {
        connection,
      }),
      [QUEUE_NFT_EMAILS]: new Queue(QUEUE_NFT_EMAILS, {
        connection,
      }),
      [QUEUE_TAG_FOLLOW_EMAIL]: new Queue(QUEUE_TAG_FOLLOW_EMAIL, {
        connection,
      }),
      [QUEUE_MANUFACTURER_EMAIL]: new Queue(QUEUE_MANUFACTURER_EMAIL, {
        connection,
      }),
      [QUEUE_VIDEO_GENERATION]: new Queue(QUEUE_VIDEO_GENERATION, {
        connection,
      }),
      [QUEUE_PROMO_VIDEO_GENERATION]: new Queue(QUEUE_PROMO_VIDEO_GENERATION, {
        connection,
      }),
      [PRE_EXPIRED_CONCEPTS_DELETION_EMAIL]: new Queue(
        PRE_EXPIRED_CONCEPTS_DELETION_EMAIL,
        {
          connection,
        },
      ),
      [EXPIRED_CONCEPTS_DELETION_EMAIL]: new Queue(
        EXPIRED_CONCEPTS_DELETION_EMAIL,
        {
          connection,
        },
      ),
      [GET_PDF_TEMPLATE]: new Queue(GET_PDF_TEMPLATE, { connection }),
      [GENERATE_ADS_DOCUMENT]: new Queue(GENERATE_ADS_DOCUMENT, {
        connection,
      }),
      [QUEUE_TEASER_GENERATE_NAME]: new Queue(QUEUE_TEASER_GENERATE_NAME, {
        connection,
      }),
      [QUEUE_PRIOR_ART_NAME]: new Queue(QUEUE_PRIOR_ART_NAME, { connection }),
      [SEND_NEW_EMPLOYEE_EMAIL]: new Queue(SEND_NEW_EMPLOYEE_EMAIL, {
        connection,
      }),
      [QUEUE_3D_MODEL_GENERATE]: new Queue(QUEUE_3D_MODEL_GENERATE, {
        connection,
      }),
      [CREATE_COMPONENT]: new Queue(CREATE_COMPONENT, {
        connection,
      }),
      [QUEUE_PATENT_TOKEN_LAUNCH]: new Queue(QUEUE_PATENT_TOKEN_LAUNCH, {
        connection,
      }),
      [PROPOSE_NEW_COMPONENT]: new Queue(PROPOSE_NEW_COMPONENT, {
        connection,
      }),
      [QUEUE_COMMUNITY_IMPORT]: new Queue(QUEUE_COMMUNITY_IMPORT, {
        connection,
      }),
      [QUEUE_AGENT_MAIL]: new Queue(QUEUE_AGENT_MAIL, {
        connection,
      }),
      [QUEUE_AGENT_MAIL_IMPORT]: new Queue(QUEUE_AGENT_MAIL_IMPORT, {
        connection,
      }),
      [QUEUE_CATALOGUE_IMPORT]: new Queue(QUEUE_CATALOGUE_IMPORT, {
        connection,
      }),
    };

    this.workers = {};
  }

  async addToQueue(queueName, data = {}) {
    const queue = this.queues[queueName];
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    await queue.add(queueName, data, {
      attempts: 1,
      backoff: { type: 'exponential', delay: 1000 },
    });
    this.logger.info(`Added job to queue ${queueName}`);
  }

  async removeMessage(queueName, item) {
    const queue = this.queues[queueName];
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    try {
      const job = await queue.getJob(item.id);
      if (job) {
        if ((await job.isActive()) || (await job.isWaiting())) {
          this.logger.warn(
            `Job ${item.id} is currently active or waiting and cannot be removed from queue ${queueName}`,
          );
          return;
        }
        await job.remove();
        this.logger.info(`Removed job ${item.id} from queue ${queueName}`);
      } else {
        this.logger.warn(`Job ${item.id} not found in queue ${queueName}`);
      }
    } catch (error) {
      this.logger.error(
        `Error removing job ${item.id} from queue ${queueName}:`,
        error,
      );
    }
  }

  async _execute(job) {
    const { name } = job;
    this.logger.info(`Processing ${name}`);

    switch (name) {
      case QUEUE_IMAGE_GENERATE_NAME: {
        this.logger.info('Generating Image...');
        break;
      }
      case QUEUE_DESCRIPTION_GENERATE: {
        this.logger.info('Generating Description...');
        break;
      }
      case QUEUE_TEASER_GENERATE_NAME: {
        this.logger.info('Generating Name...');
        break;
      }
      case QUEUE_PRIOR_ART_NAME: {
        this.logger.info('Generating Prior Art...');
        break;
      }
      case QUEUE_VIDEO_GENERATION: {
        this.logger.info('Generating Video...');
        break;
      }
      case QUEUE_PROMO_VIDEO_GENERATION: {
        this.logger.info('Generating Promo Video...');
        break;
      }
      case QUEUE_REWARD_DISTRIBUTE: {
        this.logger.info('Distributing reward...');
        break;
      }
      case QUEUE_TAG_FOLLOW_EMAIL: {
        this.logger.info('Tag follow Email Sent...');
        break;
      }
      case QUEUE_NFT_EMAILS: {
        this.logger.info('Nft email sent...');
        break;
      }
      case QUEUE_MANUFACTURER_EMAIL: {
        this.logger.info('Manufacturer Email Sent...');
        break;
      }
      case PRE_EXPIRED_CONCEPTS_DELETION_EMAIL: {
        this.logger.info('PRE EXPIRED CONCEPTS DELETION EMAIL Sent...');
        break;
      }
      case EXPIRED_CONCEPTS_DELETION_EMAIL: {
        this.logger.info('EXPIRED CONCEPTS DELETION EMAIL Sent...');
        break;
      }
      case SEND_NEW_EMPLOYEE_EMAIL: {
        this.logger.info('New Employee Email Sent....');
        break;
      }
      case GET_PDF_TEMPLATE: {
        this.logger.info('PDF successfully generated...');
        break;
      }
      case GENERATE_ADS_DOCUMENT: {
        this.logger.info('ADS document successfully generated...');
        break;
      }
      case CREATE_COMPONENT: {
        this.logger.info('Creating component...');
        break;
      }
      case QUEUE_3D_MODEL_GENERATE: {
        this.logger.info('Generating 3D model with Hyper3D...');
        break;
      }
      case QUEUE_PATENT_TOKEN_LAUNCH: {
        this.logger.info('Launching patent token...');
        break;
      }
      default: {
        this.logger.warn(`No handler for job: ${name}`);
      }
    }
    return Promise.resolve();
  }

  async closeConnections() {
    for (const queueName in this.queues) {
      await this.queues[queueName].close();
    }

    for (const workerName in this.workers) {
      await this.workers[workerName].close();
    }

    await connection.quit();
  }
}

process.on('SIGINT', async () => {
  await queueDb.closeConnections();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.info('SIGTERM signal received: closing queues');

  await queueDb.closeConnections();
  process.exit(0);
});

const queueDb = new QueueDb();
module.exports = {
  connection,
  CREATE_COMPONENT,
  EXPIRED_CONCEPTS_DELETION_EMAIL,
  GET_PDF_TEMPLATE,
  GENERATE_ADS_DOCUMENT,
  PRE_EXPIRED_CONCEPTS_DELETION_EMAIL,
  QUEUE_3D_MODEL_GENERATE,
  QUEUE_DESCRIPTION_GENERATE,
  QUEUE_IMAGE_GENERATE_NAME,
  QUEUE_MANUFACTURER_EMAIL,
  QUEUE_NFT_EMAILS,
  QUEUE_VIDEO_GENERATION,
  QUEUE_PROMO_VIDEO_GENERATION,
  QUEUE_PRIOR_ART_NAME,
  QUEUE_REWARD_DISTRIBUTE,
  QUEUE_TAG_FOLLOW_EMAIL,
  QUEUE_TEASER_GENERATE_NAME,
  QUEUE_PATENT_TOKEN_LAUNCH,
  queueDb,
  PROPOSE_NEW_COMPONENT,
  QUEUE_AGENT_MAIL,
  QUEUE_AGENT_MAIL_IMPORT,
  QUEUE_CATALOGUE_IMPORT,
  QUEUE_COMMUNITY_IMPORT,
  SEND_NEW_EMPLOYEE_EMAIL,
};
