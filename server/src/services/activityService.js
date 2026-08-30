import Activity from '../models/Activity.js';
import { generateId } from '../utils/idGenerator.js';

export async function logActivity({ merchantId, action, entityType, entityId, description, metadata = {} }) {
  return Activity.create({
    activityId: generateId('activity'),
    merchantId,
    action,
    entityType,
    entityId,
    description,
    metadata,
  });
}
