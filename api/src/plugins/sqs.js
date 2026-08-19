import fp from 'fastify-plugin';
import { SQSClient } from '@aws-sdk/client-sqs';

async function sqsPlugin (fastify, options) {
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!process.env.AWS_REGION) {
    fastify.log.info(`sqs client: aws_region not set, defaulting to '${region}'`);
  }

  // log sqs queue url
  if (process.env.SQS_QUEUE_URL) {
    fastify.log.debug({ queueUrl: process.env.SQS_QUEUE_URL, region }, 'sqs queue configured');
  } else {
    fastify.log.warn('SQS_QUEUE_URL not set');
  }

  const sqs = new SQSClient({ region });
  fastify.decorate('sqs', sqs);
}

export default fp(sqsPlugin);
