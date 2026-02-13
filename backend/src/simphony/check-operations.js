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
   * Split check by creating a NEW child check with specified items
   * 
   * In Simphony STS API, "splitting" is done by creating a new check
   * with the items to be paid separately
   */
  async splitCheck(checkRef, rvcRef, itemRefs, employeeRef) {
    try {
      const token = await this.authClient.getToken();

      // First, get the parent check details
      const parentCheck = await this.getCheckDetail(checkRef, rvcRef);

      // Filter menu items that match the itemRefs we want to split off
      const itemsToSplit = parentCheck.menuItems.filter(item => 
        itemRefs.includes(item.menuItemId.toString())
      );

      if (itemsToSplit.length === 0) {
        throw new Error('No matching items found to split');
      }

      // Create payload for NEW check with these items
      const url = `${this.baseUrl}/checks`;
      
      const payload = {
        header: {
          orgShortName: this.config.orgShortName,
          locRef: this.config.locRef,
          rvcRef: rvcRef,
          checkEmployeeRef: employeeRef,
          orderTypeRef: parentCheck.header.orderTypeRef || 1,
          guestCount: 1,
          language: "en-US",
          isTrainingCheck: false,
          status: "open"
        },
        menuItems: itemsToSplit.map(item => ({
          menuItemId: item.menuItemId,
          definitionSequence: item.definitionSequence || 1,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          priceSequence: item.priceSequence || 1,
          total: item.total,
          seat: item.seat || 1,
          surcharge: item.surcharge || 0,
          condiments: item.condiments || []
        }))
      };

      logger.info('Creating child check (split operation)', {
        parentCheck: checkRef,
        itemCount: itemsToSplit.length,
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

      const childCheckRef = response.data.header.checkRef;
      
      logger.info('Child check created successfully (split complete)', {
        parentCheck: checkRef,
        childCheck: childCheckRef,
        childCheckNumber: response.data.header.checkNumber
      });

      return {
        childCheckRef,
        parentCheckRef: checkRef,
        childCheckNumber: response.data.header.checkNumber
      };

    } catch (error) {
      logger.error('Failed to split check (create child check)', {
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