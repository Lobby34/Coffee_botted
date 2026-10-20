'use strict';

const { getPool } = require('../database');
const { createBrewService } = require('./service');

let service;
function getService() {
  if (!service) service = createBrewService(getPool());
  return service;
}
module.exports = { getService };
