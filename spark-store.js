import * as databaseAPI from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js';
import {createSparkStore as createStore} from './spark-store-core.js?v=20261020.spark1';
export const createSparkStore=(database,auth)=>createStore(database,auth,databaseAPI);
