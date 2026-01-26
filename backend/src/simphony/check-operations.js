const axios = require('axios');
const logger = require('../utils/logger');

class SimphonyCheckOperations {
  constructor(config, authClient) {
    this.config = config;
    this.authClient = authClient;
    this.baseUrl = config.stsBaseUrl.replace(/\/$/, '');
  }

  /**
   * Get detailed check information from Simphony
   */
  async getCheckDetail(checkRef, rvcRef) {
    try {
      const token = await this.authClient.getToken();
      
      // FIXED: Use the correct STS API endpoint format
      const url = `${this.baseUrl}/checks/${encodeURIComponent(checkRef)}`;

      logger.info('Fetching check detail', { checkRef, rvcRef });

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Simphony-OrgShortName': this.config.orgShortName,
          'Simphony-LocRef': this.config.locRef,
          'Simphony-RvcRef': String(rvcRef)
        },
        timeout: 20000
      });

      logger.info('Check detail retrieved', {
        checkRef,
        checkNumber: response.data.header?.checkNumber,
        status: response.data.header?.status
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get check detail', {
        checkRef,
        rvcRef,
        error: error.message,
        response: error.response?.data
      });
      throw new Error(`Failed to get check ${checkRef}: ${error.message}`);
    }
  }

  /**
   * Split check by creating a child check with specified items
   */
  async splitCheck(checkRef, rvcRef, itemRefs, employeeRef) {
    try {
      const token = await this.authClient.getToken();
      
      // FIXED: Use the correct STS API endpoint format
      const url = `${this.baseUrl}/checks/${encodeURIComponent(checkRef)}/split`;

      const payload = {
        menuItems: itemRefs,
        checkEmployeeRef: employeeRef
      };

      logger.info('Splitting check', {
        checkRef,
        rvcRef,
        itemCount: itemRefs.length,
        employeeRef
      });

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Simphony-OrgShortName': this.config.orgShortName,
          'Simphony-LocRef': this.config.locRef,
          'Simphony-RvcRef': String(rvcRef)
        },
        timeout: 20000
      });

      const childCheckRef = response.data.childCheckRef;
      logger.info('Check split successful', {
        parentCheck: checkRef,
        childCheck: childCheckRef
      });

      return {
        childCheckRef,
        parentCheckRef: response.data.parentCheckRef
      };
    } catch (error) {
      logger.error('Failed to split check', {
        checkRef,
        rvcRef,
        itemRefs,
        error: error.message,
        response: error.response?.data
      });
      throw new Error(`Failed to split check ${checkRef}: ${error.message}`);
    }
  }

  /**
   * Close a check (finalize it)
   */
  async closeCheck(checkRef, rvcRef) {
    try {
      const token = await this.authClient.getToken();
      
      // FIXED: Use the correct STS API endpoint format
      const url = `${this.baseUrl}/checks/${encodeURIComponent(checkRef)}/close`;

      logger.info('Closing check', { checkRef, rvcRef });

      const response = await axios.post(
        url,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Simphony-OrgShortName': this.config.orgShortName,
            'Simphony-LocRef': this.config.locRef,
            'Simphony-RvcRef': String(rvcRef)
          },
          timeout: 20000
        }
      );

      logger.info('Check closed successfully', { checkRef });

      return response.data;
    } catch (error) {
      logger.error('Failed to close check', {
        checkRef,
        rvcRef,
        error: error.message,
        response: error.response?.data
      });
      throw new Error(`Failed to close check ${checkRef}: ${error.message}`);
    }
  }
}

module.exports = SimphonyCheckOperations;