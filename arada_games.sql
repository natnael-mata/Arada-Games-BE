-- MySQL dump 10.13  Distrib 8.0.45, for Linux (x86_64)
--
-- Host: localhost    Database: arada_games
-- ------------------------------------------------------
-- Server version	8.0.45-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `contact_submissions`
--

DROP TABLE IF EXISTS `contact_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contact_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fullName` varchar(255) NOT NULL,
  `phoneNumber` varchar(50) NOT NULL,
  `message` text NOT NULL,
  `submittedAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contact_submissions`
--

LOCK TABLES `contact_submissions` WRITE;
/*!40000 ALTER TABLE `contact_submissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `contact_submissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `games`
--

DROP TABLE IF EXISTS `games`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `games` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `image` varchar(255) DEFAULT NULL,
  `route` varchar(255) DEFAULT NULL,
  `modeLabel` varchar(255) DEFAULT NULL,
  `playerCountLabel` varchar(255) DEFAULT NULL,
  `rating` int DEFAULT NULL,
  `launchType` varchar(50) DEFAULT NULL,
  `launchUrl` varchar(255) DEFAULT NULL,
  `requiresHealthCheck` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `games`
--

LOCK TABLES `games` WRITE;
/*!40000 ALTER TABLE `games` DISABLE KEYS */;
INSERT INTO `games` VALUES (1,'escape-demb','Escape Demb','/assets/images/escape_d_poster.jpg','/aradagame/escape-demb','Multiplayer','1k players',5,'asset','/assets/aradaGameWB/escape-d/index.html',0),(2,'archerswebb','ArchersWebb','/assets/aradaGameWB/ArchersWebb/client/index.png','/aradagame/archerswebb','Multiplayer','Live server',5,'external','http://localhost:8081/',1),(3,'xo','XO','/assets/images/XO.png','/aradagame/xo','Multiplayer','1k players',5,'asset','/assets/aradaGameWB/xo/index.html',0),(4,'my-planet','My Planet','/assets/images/My Planet.png','/aradagame/my-planet','Multiplayer','1k players',5,'asset','/assets/aradaGameWB/my_plante_defence/index.html',0),(5,'one-eye','One Eye','/assets/images/One Eye.png','/aradagame/one-eye','Multiplayer','1k players',5,'asset','/assets/aradaGameWB/one_eye/index.html',0);
/*!40000 ALTER TABLE `games` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `full_name` varchar(255) DEFAULT NULL,
  `nick_name` varchar(255) DEFAULT NULL,
  `sex` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `telegram_username` varchar(255) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `active_token` varchar(500) DEFAULT NULL,
  `active_device_id` varchar(255) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','admin123','active','System Admin','Admin','M','admin@arada-games.et','@admin','Addis Ababa',NULL,NULL,'2026-04-28 20:48:12'),(2,'251943016897','pass1234','active','Natnael Mata','Tester','M','natnael@example.com','@natnael','Addis Ababa',NULL,NULL,'2026-04-28 20:48:12'),(3,'251943016899','pass1234','active','Abebe Kebede','Abe','M','abe@example.com',NULL,'Addis Ababa',NULL,NULL,'2026-04-28 20:55:28'),(4,'251920220308','pass1234','active','Marta Alemu','Marti','F','marti@example.com',NULL,'Adama',NULL,NULL,'2026-04-28 20:55:28');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `game_scores`
--

DROP TABLE IF EXISTS `game_scores`;
CREATE TABLE `game_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) NOT NULL,
  `nick_name` varchar(255) DEFAULT NULL,
  `score` int DEFAULT '0',
  `game_mode` varchar(50) DEFAULT NULL,
  `difficulty` varchar(50) DEFAULT NULL,
  `moves_taken` int DEFAULT NULL,
  `result` varchar(50) DEFAULT NULL,
  `played_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `game_slug` varchar(255) DEFAULT 'xo',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `game_scores_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `game_scores`
--

LOCK TABLES `game_scores` WRITE;
/*!40000 ALTER TABLE `game_scores` DISABLE KEYS */;
INSERT INTO `game_scores` (user_id, nick_name, score, game_mode, result, game_slug) VALUES ('251943016897', 'Tester', 500, 'single', 'win', 'escape-demb');
INSERT INTO `game_scores` (user_id, nick_name, score, game_mode, result, game_slug) VALUES ('251943016897', 'Tester', 12, 'single', 'win', 'my-planet');
INSERT INTO `game_scores` (user_id, nick_name, score, game_mode, result, game_slug) VALUES ('251943016897', 'Tester', 190, 'multiplayer', 'win', 'xo');
/*!40000 ALTER TABLE `game_scores` ENABLE KEYS */;
UNLOCK TABLES;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-03 19:18:00
