-- Create user with password authentication
CREATE USER axton_api WITH PASSWORD 'verband-trommel';

-- Grant database and schema permissions
GRANT CONNECT ON DATABASE axton TO axton_dev;
GRANT USAGE ON SCHEMA public TO axton_dev;

-- Grant permissions on existing objects
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO axton_dev;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO axton_dev;

-- Grant permissions on future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO axton_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO axton_dev;