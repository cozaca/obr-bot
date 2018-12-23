import bodyParser from 'body-parser';
import {log} from './/utils';
import router from './/route';

export default function (app) {
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true}));

    app.use(router);

    app.use((req, res) => {
        res.status(404).send({
            status: 404,
            message: 'The request resource was not found.',
        });
    });

    app.use((err, req, res) => {
        log.error(err.stack);
        const message = process.env.NODE_ENV === 'production' ? 'Something went wrong ...' : err.stack;
        res.status(500).send({
            status: 500,
            message,
        });
    });
}