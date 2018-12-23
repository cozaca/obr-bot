import express from 'express'
import { log } from './/utils'

const router = new express.Router();

router.post('/slack/command/hello_Rbot', async (req, res) => {
    try {
        const slackReqObj = req.body;
        const response = {
            response_type: 'in_channel',
            channel: slackReqObj.channel_id,
            text: 'Hello Rbot. How can I help you ? :slightly_smiling_fase:'
        };

        return res.json(response);
    }
    catch (err) {
        log.error(err);
    }
});

export default router;