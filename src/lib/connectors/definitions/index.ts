import { ConnectorDefinition } from '../types';
import { cloudWarehouses } from './cloud-warehouses';
import { databases } from './databases';
import { cloudServices } from './cloud-services';
import { fileConnectors } from './files';
import { cloudStorageConnectors } from './cloud-storage';
import { restApiConnectors } from './rest-api';
import { connectivityConnectors } from './connectivity';

export const ALL_CONNECTORS: ConnectorDefinition[] = [
  ...cloudWarehouses,
  ...databases,
  ...cloudServices,
  ...fileConnectors,
  ...cloudStorageConnectors,
  ...restApiConnectors,
  ...connectivityConnectors,
];
